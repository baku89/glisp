/**
 * Session: an interactive Glisp environment whose state is a single
 * let-block AST.
 *
 * The conceptual chain is `prelude ← session`, where the session is
 * one let-block that grows as the user types. `name = expr` is shell
 * syntax for an `IO` action that adds or replaces a binding; everything
 * else is evaluated against the session's env (its bindings layered on
 * the prelude). Evaluating never changes anything: only running an action
 * does, by installing a new frame. The let-block is the
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

import { type EvalResult, IO, isIO, pushLetFrame } from './eval.js'
import { lex } from './lex.js'
import { parse, ParseError } from './parse.js'
import { Runtime, type RuntimeStats } from './runtime.js'
import {
	type AST,
	type Env,
	type Frame,
	CallAST,
	LetAST,
	RecordAST,
	type RecordEntry,
	SpreadAST,
	UNIT,
	VecAST,
} from './types.js'

export class Session {
	private letBlock = new LetAST([], null)
	private frame: Frame
	private readonly runtime: Runtime

	constructor(private readonly parent: Env) {
		this.frame = pushLetFrame(this.letBlock, parent) as Frame
		this.runtime = new Runtime(parent)
		this.runtime.setRoot(this.letBlock)
	}

	/** Env to evaluate against: the session's let-frame on top of the prelude. */
	get env(): Env {
		return this.frame
	}

	/** The session as a let-block AST: its single source of truth. */
	ast(): LetAST {
		return this.letBlock
	}

	/**
	 * Replace the let-block. This is the one way the session changes, so a
	 * host can restore an earlier `ast()` to undo, at no cost.
	 */
	setAst(ast: LetAST): void {
		this.letBlock = ast
		this.frame = pushLetFrame(ast, this.parent) as Frame
		this.runtime.setRoot(ast)
	}

	/** What a binding is bound to, or undefined if it is unbound. */
	bindingAst(name: string): AST | undefined {
		return this.letBlock.bindings.find(([n]) => n === name)?.[1]
	}

	/** What evaluation has cost since the last `resetStats`. */
	stats(): RuntimeStats {
		return this.runtime.stats()
	}

	resetStats(): void {
		this.runtime.resetStats()
	}

	/** Names currently bound in the session, in insertion order. */
	bindings(): ReadonlyArray<string> {
		return this.letBlock.bindings.map(([name]) => name)
	}

	/** Set or replace a binding. Last-wins by name. */
	setBinding(name: string, ast: AST): void {
		const bindings = this.letBlock.bindings
		const index = bindings.findIndex(([n]) => n === name)
		const next =
			index === -1
				? [...bindings, [name, ast] as const]
				: bindings.map((b, i) => (i === index ? ([name, ast] as const) : b))
		this.setAst(new LetAST(next, null))
	}

	/** Remove a binding. Returns whether it was present. */
	unsetBinding(name: string): boolean {
		const bindings = this.letBlock.bindings
		const next = bindings.filter(([n]) => n !== name)
		if (next.length === bindings.length) return false
		this.setAst(new LetAST(next, null))
		return true
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
		const target = this.letBlock.bindings.find(([name]) => name === head)
		if (target === undefined) return `no such binding: ${head}`
		const updated = setAtPathInAst(target[1], rest, expr)
		if (typeof updated === 'string') return updated
		this.setBinding(head, updated)
		return null
	}

	/** Clear every binding. Equivalent to a fresh session. */
	reset(): void {
		this.setAst(new LetAST([], null))
	}

	/** Evaluate an AST against the session env. */
	evalAst(ast: AST): EvalResult {
		return this.runtime.evaluate(ast, this.env)
	}

	/**
	 * Shell entry point. `name = expr` and `path/seg = expr` (path segments
	 * are identifiers or integer indices) evaluate to an `IO` that performs
	 * the assignment when run; everything else goes through `parse` and
	 * `evalAst`. Throws `ParseError` if the source can't be parsed.
	 */
	evalSrc(src: string): EvalResult {
		const sugar = parseAssignmentSugar(src)
		if (sugar === null) return this.evalAst(parse(src))
		const expr = parse(sugar.exprSrc)
		const action = new IO(src.trim(), () => {
			const err = this.setAtPath(sugar.path, expr)
			if (err === null) return []
			return [
				{
					level: 'error',
					message: `assignment failed: ${err}`,
					source: { ast: expr, env: this.env },
				},
			]
		})
		return { value: action, diagnostics: [] }
	}

	/**
	 * `evalSrc`, then run the result if it is an `IO`. An action's own
	 * diagnostics are appended to the evaluation's.
	 */
	exec(src: string): EvalResult {
		const r = this.evalSrc(src)
		if (!isIO(r.value)) return r
		const effects = r.value.run()
		return { value: UNIT, diagnostics: [...r.diagnostics, ...effects] }
	}
}

/** Re-export for downstream callers that wrap session.evalAst. */
export { isIO }

/**
 * Replace the sub-AST at `path` inside `ast` with `replacement`. The
 * traversal handles let-blocks (by binding name), records (by field
 * name), vectors (by integer index), and calls (0 is the head, as in paths). Returns the rewritten AST,
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
		case 'call': {
			if (typeof seg !== 'number') return `expected index, got ${seg}`
			if (seg === 0) {
				const head = setAtPathInAst(ast.head, rest, replacement)
				return typeof head === 'string' ? head : new CallAST(head, ast.args, ast.kwargs)
			}
			if (seg < 0 || seg > ast.args.length) return `argument index out of range: ${seg}`
			const next = setAtPathInAst(ast.args[seg - 1]!, rest, replacement)
			if (typeof next === 'string') return next
			const args = ast.args.slice()
			args[seg - 1] = next
			return new CallAST(ast.head, args, ast.kwargs)
		}
		default:
			return `cannot descend into ${ast.kind}`
	}
}

/**
 * The expression being assigned in `name = expr` or `path/seg = expr`, or null
 * if `src` is not an assignment.
 */
export function assignmentExpression(src: string): string | null {
	return parseAssignmentSugar(src)?.exprSrc ?? null
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
