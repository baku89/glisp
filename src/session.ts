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
import { parse } from './parse.js'
import {
	type AST,
	type BindingTarget,
	type Diagnostic,
	type Env,
	type Frame,
	LetAST,
	UNIT,
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

	/** Convenience: parse + `evalAst`. */
	evalSrc(src: string): EvalResult {
		return this.evalAst(parse(src))
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
