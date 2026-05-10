/**
 * Session: an interactive Glisp environment whose state is a single
 * let-block AST.
 *
 * The conceptual chain is `prelude ← session`, where the session is
 * one let-block that grows as the user types. `name = expr` and
 * `(def "name" expr)` add or replace a binding; `(undef "name")`
 * removes one; everything else is evaluated against the session's
 * env (its bindings layered on the prelude). The let-block is the
 * single source of truth for the session — `ast()` returns it as a
 * regular `LetAST`, which a host can edit, render in a tree pane,
 * or persist as a project file.
 *
 * The same shape extends downward: the prelude itself is conceptually
 * one let-block (one big, immutable family of bindings), and a host
 * application's project file is yet another let-block on top of the
 * session. So the chain `prelude ← session ← project` is just three
 * let-blocks composed by frame-parenting. This is the basic shape of
 * a creative-software embedding: the host keeps a project AST, the
 * user types into a REPL that mutates it, and both views (the REPL
 * output and the structural tree) stay in sync because they read
 * from the same source.
 */

import { evaluate, type EvalResult, isIO } from './eval.js'
import { lex } from './lex.js'
import { parse, ParseError } from './parse.js'
import {
	type AST,
	type BindingTarget,
	type Diagnostic,
	type Env,
	type Frame,
	LetAST,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	UNIT,
	VecAST,
} from './types.js'

export class Session {
	private readonly bindingMap = new Map<string, BindingTarget>()
	private readonly frame: Frame

	constructor(parent: Env) {
		this.frame = {
			ast: new LetAST([], null),
			parent,
			bindings: this.bindingMap,
		}
	}

	/** Env to evaluate against: the session's let-frame on top of the prelude. */
	get env(): Env {
		return this.frame
	}

	/** Snapshot of the session as a let-block AST. Re-parses cleanly. */
	ast(): LetAST {
		const entries: [string, AST][] = []
		for (const [name, target] of this.bindingMap) {
			entries.push([name, target.ast])
		}
		return new LetAST(entries, null)
	}

	/** Names currently bound in the session, in insertion order. */
	bindings(): ReadonlyArray<string> {
		return [...this.bindingMap.keys()]
	}

	/** Set or replace a binding. Last-wins by name. */
	setBinding(name: string, ast: AST): void {
		this.bindingMap.set(name, { ast, env: this.frame })
	}

	/** Remove a binding. Returns whether it was present. */
	unsetBinding(name: string): boolean {
		return this.bindingMap.delete(name)
	}

	/**
	 * Set the AST at a path inside the session let-block. The first
	 * segment names a top-level binding; further segments descend into
	 * its value's structure (let-block, record, vector, function body).
	 *
	 * Returns `null` on success, or a string describing why the path
	 * could not be reached. The session is mutated only on success.
	 */
	setAtPath(
		path: ReadonlyArray<string | number>,
		expr: AST
	): string | null {
		if (path.length === 0) return 'empty path'
		const [head, ...rest] = path
		if (typeof head !== 'string') return 'top-level path must start with a name'
		if (rest.length === 0) {
			this.setBinding(head, expr)
			return null
		}
		const target = this.bindingMap.get(head)
		if (target === undefined) return `no such binding: ${head}`
		const updated = setAtPathInAst(target.ast, rest, expr)
		if (typeof updated === 'string') return updated
		this.setBinding(head, updated)
		return null
	}

	/** Clear every binding. Equivalent to a fresh session. */
	reset(): void {
		this.bindingMap.clear()
	}

	/**
	 * Evaluate an AST against the session env. Top-level
	 * `(def "name" expr)` / `(undef "name")` are intercepted as
	 * binding mutations on the session's let-block; everything else
	 * is delegated to `evaluate`. Top-level `IO` results are passed
	 * through unchanged so the caller can decide whether to force them
	 * (the CLI / browser REPLs auto-run them).
	 */
	evalAst(ast: AST): EvalResult {
		const mut = detectBindingMutation(ast)
		if (mut !== null) return this.applyMutation(mut, ast)
		return evaluate(ast, this.env)
	}

	/**
	 * REPL-friendly entry point. Recognizes top-level
	 * `name = expr`, `path/seg = expr` (path-based assignment over
	 * the existing let-block), and `(undef "name")`; everything else
	 * goes through `parse` + `evalAst`. Path segments are identifiers
	 * or integer indices separated by `/`. Throws `ParseError` if the
	 * source can't be parsed.
	 */
	evalSrc(src: string): EvalResult {
		const sugar = parseAssignmentSugar(src)
		if (sugar !== null) {
			return this.applyAssignment(sugar, src)
		}
		return this.evalAst(parse(src))
	}

	private applyAssignment(
		s: AssignmentSugar,
		source: string
	): EvalResult {
		let exprAst: AST
		try {
			exprAst = parse(s.exprSrc)
		} catch (e) {
			throw e
		}
		const err = this.setAtPath(s.path, exprAst)
		if (err !== null) {
			const diag: Diagnostic = {
				level: 'error',
				message: `assignment failed: ${err}`,
				source: { ast: exprAst, env: this.env },
			}
			return { value: UNIT, diagnostics: [diag] }
		}
		return { value: UNIT, diagnostics: [] }
	}

	private applyMutation(mut: BindingMutation, source: AST): EvalResult {
		if (mut.kind === 'set') {
			this.setBinding(mut.name, mut.expr)
			return { value: UNIT, diagnostics: [] }
		}
		const removed = this.unsetBinding(mut.name)
		if (!removed) {
			const diag: Diagnostic = {
				level: 'warning',
				message: `undef: no such binding ${JSON.stringify(mut.name)}`,
				source: { ast: source, env: this.env },
			}
			return { value: UNIT, diagnostics: [diag] }
		}
		return { value: UNIT, diagnostics: [] }
	}
}

/** Re-export for downstream callers that wrap session.evalAst. */
export { isIO }

type BindingMutation =
	| { kind: 'set'; name: string; expr: AST }
	| { kind: 'unset'; name: string }

/**
 * Replace the sub-AST at `path` inside `ast` with `replacement`. The
 * traversal handles let-blocks (by binding name), records (by field
 * name), and vectors (by integer index). Returns the rewritten AST,
 * or a string error message if the path goes off the end.
 */
function setAtPathInAst(
	ast: AST,
	path: ReadonlyArray<string | number>,
	replacement: AST
): AST | string {
	if (path.length === 0) return replacement
	const [seg, ...rest] = path
	switch (ast.kind) {
		case 'let': {
			if (typeof seg !== 'string') return `expected name segment, got ${seg}`
			for (let i = 0; i < ast.bindings.length; i++) {
				const [name, value] = ast.bindings[i]!
				if (name !== seg) continue
				const next = setAtPathInAst(value, rest, replacement)
				if (typeof next === 'string') return next
				const newBindings: Array<readonly [string, AST]> = ast.bindings.slice()
				newBindings[i] = [name, next] as const
				return new LetAST(newBindings, ast.body)
			}
			return `no binding named ${seg}`
		}
		case 'record': {
			if (typeof seg !== 'string') return `expected field name, got ${seg}`
			for (let i = 0; i < ast.fields.length; i++) {
				const entry = ast.fields[i]!
				if (entry instanceof SpreadAST) continue
				const [name, value] = entry
				if (name !== seg) continue
				const next = setAtPathInAst(value, rest, replacement)
				if (typeof next === 'string') return next
				const newFields: RecordEntry[] = ast.fields.slice()
				newFields[i] = [name, next] as const
				return new RecordAST(newFields, ast.optional)
			}
			return `no field named ${seg}`
		}
		case 'vec': {
			if (typeof seg !== 'number') return `expected index, got ${seg}`
			if (seg < 0 || seg >= ast.elements.length) {
				return `vector index out of range: ${seg}`
			}
			const next = setAtPathInAst(ast.elements[seg]!, rest, replacement)
			if (typeof next === 'string') return next
			const newElements = ast.elements.slice()
			newElements[seg] = next
			return new VecAST(newElements)
		}
		default:
			return `cannot descend into ${ast.kind}`
	}
}

interface AssignmentSugar {
	readonly path: ReadonlyArray<string | number>
	readonly exprSrc: string
}

/**
 * Recognize `name = expr` and `name/seg/seg... = expr` at the top of
 * the input. Returns the resolved path and the source slice that
 * follows the `=`. Returns null when the input doesn't begin with an
 * identifier-then-`=` (or path-`=`) shape.
 *
 * Path segments after the first must be identifiers or integer
 * literals. The first segment (the binding name) is required to be an
 * identifier.
 */
function parseAssignmentSugar(src: string): AssignmentSugar | null {
	let tokens
	try {
		tokens = lex(src)
	} catch {
		return null
	}
	let i = 0
	const head = tokens[i]
	if (head?.kind !== 'identifier') return null
	const path: Array<string | number> = [head.value as string]
	i++
	while (true) {
		const t = tokens[i]
		if (t === undefined) return null
		if (t.kind === '=') {
			const exprSrc = src.slice(t.end).trim()
			if (exprSrc === '') return null
			return { path, exprSrc }
		}
		// Expect: '/' followed by an identifier or number.
		if (t.kind !== 'identifier' || t.value !== '/') return null
		const next = tokens[i + 1]
		if (next === undefined) return null
		if (next.kind === 'identifier' && next.value !== '/') {
			path.push(next.value as string)
			i += 2
			continue
		}
		if (next.kind === 'number' && Number.isInteger(next.value as number)) {
			path.push(next.value as number)
			i += 2
			continue
		}
		return null
	}
}

/**
 * Detect a top-level `(def "name" expr)` or `(undef "name")` call.
 * Returns null for any other shape (including nested def / undef).
 */
function detectBindingMutation(ast: AST): BindingMutation | null {
	if (ast.kind !== 'call') return null
	const head = ast.head
	if (head.kind !== 'sym') return null
	if (head.name === 'def') {
		const [nameAst, exprAst] = ast.args
		if (
			nameAst === undefined ||
			exprAst === undefined ||
			nameAst.kind !== 'lit' ||
			typeof nameAst.value !== 'string'
		) {
			return null
		}
		return { kind: 'set', name: nameAst.value, expr: exprAst }
	}
	if (head.name === 'undef') {
		const [nameAst] = ast.args
		if (
			nameAst === undefined ||
			nameAst.kind !== 'lit' ||
			typeof nameAst.value !== 'string'
		) {
			return null
		}
		return { kind: 'unset', name: nameAst.value }
	}
	return null
}
