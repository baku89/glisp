/**
 * Standalone static type checker.
 *
 * Walks an AST and surfaces type mismatches *before* the evaluator
 * forces anything. This is the type-side counterpart to `eval`: where
 * `eval` uses dynamic dispatch and emits diagnostics during execution,
 * `check` produces the same diagnostics by purely traversing the tree.
 *
 * The two share infrastructure (`infer`, `typeFits`) so a mismatch
 * surfaced statically here is the same one `callTypedHostFn` /
 * `applyClosure` would emit at runtime — just earlier, and even for
 * branches that never run.
 *
 * Spec: docs/spec/types.md — Type inference / static checking
 */

import {
	evaluate,
	type GlispClosure,
	isGlispClosure,
	isTypedHostFn,
	isTypeValue,
	type TypedHostFn,
	type TypeValue,
	typeFits,
} from './eval.js'
import { infer } from './infer.js'
import {
	type AST,
	type CallAST,
	type Diagnostic,
	type Env,
	SpreadAST,
} from './types.js'

/**
 * Check `ast` for type errors against `env`. Returns all diagnostics
 * produced by recursive traversal. Never throws.
 */
export function check(ast: AST, env: Env): ReadonlyArray<Diagnostic> {
	const diagnostics: Diagnostic[] = []
	walk(ast, env, diagnostics)
	return diagnostics
}

function walk(ast: AST, env: Env, diagnostics: Diagnostic[]): void {
	switch (ast.kind) {
		case 'call':
			walkCall(ast, env, diagnostics)
			break
		case 'vec':
			for (const e of ast.elements) walk(e, env, diagnostics)
			break
		case 'record':
			for (const entry of ast.fields) {
				if (entry instanceof SpreadAST) {
					walk(entry.expr, env, diagnostics)
				} else {
					walk(entry[1], env, diagnostics)
				}
			}
			break
		case 'let':
			for (const [, valueAst] of ast.bindings) {
				walk(valueAst, env, diagnostics)
			}
			if (ast.body !== null) walk(ast.body, env, diagnostics)
			break
		case 'access':
			walk(ast.target, env, diagnostics)
			break
		case 'meta':
		case 'quote':
		case 'unquote':
		case 'spread':
		case 'splice':
			walk(ast.expr, env, diagnostics)
			break
		case 'fn':
			if (ast.body !== null) walk(ast.body, env, diagnostics)
			break
		// lit / host / sym / path: terminals
	}
}

function walkCall(ast: CallAST, env: Env, diagnostics: Diagnostic[]): void {
	// Special forms — short-circuit. `def` and `undef` have a non-standard
	// argument convention (the body is captured as an AST without being
	// evaluated); `?` and `|>` evaluate selectively. We recurse into the
	// arms that *will* be type-checked at run-time and skip the rest.
	if (ast.head.kind === 'sym') {
		switch (ast.head.name) {
			case 'def':
			case 'undef':
				// `(def "name" expr)` — only the name is evaluated; the
				// expression is captured. Walk the expr (it's still part
				// of the program) but skip call-form checking here.
				for (const a of ast.args) walk(a, env, diagnostics)
				return
			case '?':
				// `(? value pat1 res1 pat2 res2 ...)` — recurse into all,
				// but don't try to validate this as a normal call.
				for (const a of ast.args) walk(a, env, diagnostics)
				return
			case '|>':
				for (const a of ast.args) walk(a, env, diagnostics)
				return
		}
	}

	// Recurse first so deeper errors surface even if the call's own
	// signature can't be resolved.
	walk(ast.head, env, diagnostics)
	for (const a of ast.args) walk(a, env, diagnostics)
	if (ast.kwargs) {
		for (const v of ast.kwargs.values()) walk(v, env, diagnostics)
	}

	// Resolve the head value to inspect its declared signature. We
	// deliberately use `evaluate` here — the head expression is not the
	// thing we're checking, just its bound value.
	const head = evaluate(ast.head, env).value

	if (isTypedHostFn(head)) {
		checkAgainstHostFn(ast, head, env, diagnostics)
	} else if (isGlispClosure(head)) {
		checkAgainstClosure(ast, head, env, diagnostics)
	} else if (isTypeValue(head)) {
		checkAgainstCast(ast, head, env, diagnostics)
	}
	// else: untyped host fn / vector index / record access / unknown —
	// no static signature to check.
}

function checkAgainstHostFn(
	ast: CallAST,
	fn: TypedHostFn,
	env: Env,
	diagnostics: Diagnostic[]
): void {
	const positional: AST[] = ast.args.filter(
		a => !(a instanceof SpreadAST)
	) as AST[]

	// Spread args defeat positional checking — skip when present.
	if (positional.length !== ast.args.length) return

	for (let i = 0; i < positional.length; i++) {
		const expected =
			i < fn.paramTypes.length
				? fn.paramTypes[i]!
				: fn.variadicTail !== undefined
					? fn.variadicTail
					: undefined
		if (expected === undefined) {
			diagnostics.push(
				diag(
					positional[i]!,
					env,
					`too many arguments: expected ${fn.paramTypes.length}, got ${positional.length}`
				)
			)
			continue
		}
		checkArgType(positional[i]!, expected, env, diagnostics)
	}
}

function checkAgainstClosure(
	ast: CallAST,
	closure: GlispClosure,
	env: Env,
	diagnostics: Diagnostic[]
): void {
	const fnAst = closure.ast
	const positional: AST[] = ast.args.filter(
		a => !(a instanceof SpreadAST)
	) as AST[]
	if (positional.length !== ast.args.length) return

	let p = 0
	for (let i = 0; i < positional.length; i++) {
		const param = fnAst.params[p]
		if (param === undefined) {
			diagnostics.push(
				diag(
					positional[i]!,
					env,
					`too many arguments: expected ${fnAst.params.length}, got ${positional.length}`
				)
			)
			continue
		}
		// Resolve the param's declared type in the closure's captured env.
		const tr = evaluate(param.type, closure.capturedEnv)
		if (isTypeValue(tr.value) && tr.value.typeName !== '_') {
			checkArgType(positional[i]!, tr.value, env, diagnostics)
		}
		if (!param.variadic) p++
	}
}

function checkAgainstCast(
	ast: CallAST,
	t: TypeValue,
	env: Env,
	diagnostics: Diagnostic[]
): void {
	if (ast.args.length !== 1) return
	checkArgType(ast.args[0]!, t, env, diagnostics)
}

function checkArgType(
	argAst: AST,
	expected: TypeValue,
	env: Env,
	diagnostics: Diagnostic[]
): void {
	const inferred = infer(argAst, env)
	if (inferred === null) return
	if (!typeFits(inferred, expected)) {
		diagnostics.push(
			diag(
				argAst,
				env,
				`type mismatch: expected ${expected.typeName}, got ${inferred.typeName}`
			)
		)
	}
}

function diag(ast: AST, env: Env, message: string): Diagnostic {
	return { level: 'error', message, source: { ast, env } }
}
