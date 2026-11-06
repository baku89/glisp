/**
 * What was written before keyword arguments took `:` and paths told keys from names, as it
 * is written now. See spec/syntax.md (Application — keyword arguments, Path).
 *
 * Before, `(f k=v)` passed `v` to the parameter `k`, and a path went to a record's field or a
 * call's argument by the bare name, as `./a/width`. Now that is `(f k: v)` and `./a/width:`,
 * and `k = v` and `./a/width` are said of names.
 */

import { childAt, enterNode, keySegment, rootFrame } from './eval.js'
import { lex } from './lex.js'
import { parse } from './parse.js'
import { type AST, type Env, PathAST, withoutMeta } from './types.js'

/**
 * `source`, written before, as it is written now. What cannot be read is left as it is, but for
 * its keyword arguments. `env` is where it stands, for what a call's parameters are called.
 */
export function fromOlderSyntax(source: string, env: Env): string {
	const keyworded = withKeywordsWritten(source)
	let ast: AST
	try {
		ast = parse(keyworded)
	} catch {
		return keyworded
	}
	const edits: Array<{ start: number; end: number; text: string }> = []
	visit(ast, env, (path, at) => {
		const range = path.source
		if (range === undefined || range.text !== keyworded) return
		const segments = withKeys(path.segments, at)
		if (segments === null) return
		const text = new PathAST(segments).printStructural()
		if (text !== keyworded.slice(range.start, range.end)) edits.push({ start: range.start, end: range.end, text })
	})
	return applied(keyworded, edits)
}

/** `(f k=v)` and `(f k = v)` as `(f k: v)`: inside a call, a name given something was a keyword. */
function withKeywordsWritten(source: string): string {
	let tokens
	try {
		tokens = lex(source)
	} catch {
		return source
	}
	const open: string[] = []
	const edits: Array<{ start: number; end: number; text: string }> = []
	tokens.forEach((token, i) => {
		if (token.kind === '(' || token.kind === '[' || token.kind === '{') open.push(token.kind)
		else if (token.kind === ')' || token.kind === ']' || token.kind === '}') open.pop()
		const next = tokens[i + 1]
		if (token.kind !== 'identifier' || next?.kind !== '=' || open.at(-1) !== '(') return
		let end = next.end
		while (end < source.length && /\s/.test(source[end]!)) end++
		edits.push({ start: token.end, end, text: ': ' })
	})
	return applied(source, edits)
}

function applied(source: string, edits: ReadonlyArray<{ start: number; end: number; text: string }>): string {
	let out = source
	for (const { start, end, text } of [...edits].sort((a, b) => b.start - a.start)) {
		out = out.slice(0, start) + text + out.slice(end)
	}
	return out
}

/** Each path in `ast`, with the env it starts from: that of the node it is in. Not inside a function. */
function visit(ast: AST, env: Env, onPath: (path: PathAST, env: Env) => void): void {
	const node = withoutMeta(ast)
	const inner = (child: AST) => visit(child, enterNode(node, env), onPath)
	switch (node.kind) {
		case 'path':
			return onPath(node, env)
		case 'let':
			node.bindings.forEach(([, value]) => inner(value))
			if (node.body !== null) inner(node.body)
			return
		case 'vec':
			return node.elements.forEach(inner)
		case 'record':
			return node.fields.forEach(field => inner('kind' in field ? field : field[1]))
		case 'call':
			node.args.forEach(inner)
			node.kwargs?.forEach(inner)
			return
		case 'unquote':
		case 'spread':
			return visit(node.expr, env, onPath)
		case 'access':
			return visit(node.target, env, onPath)
		default:
			return
	}
}

/**
 * The segments of a path, with what went to a record's field or a call's argument written as a
 * key, or null if there is nothing to change. Past what cannot be followed, it stays as written.
 */
function withKeys(segments: PathAST['segments'], env: Env): PathAST['segments'] | null {
	const out: Array<PathAST['segments'][number]> = []
	let frame: Env = env
	let here: AST | null = frame?.ast ?? null
	let entered = true
	for (const [i, segment] of segments.entries()) {
		if (segment === '/') {
			frame = rootFrame(env)
			here = frame?.ast ?? null
			entered = true
			out.push(segment)
			continue
		}
		if (segment === '..') {
			if (entered) frame = frame?.parent ?? null
			here = frame?.ast ?? null
			entered = true
			out.push(segment)
			continue
		}
		const holder = here === null ? null : withoutMeta(here)
		// What a name reaches now, it goes on reaching.
		const isSlot =
			typeof segment === 'string' &&
			!segment.endsWith(':') &&
			(holder?.kind === 'record' || holder?.kind === 'call') &&
			childAt(holder, segment, frame) === null
		const written = isSlot ? keySegment(segment as string) : segment
		out.push(written)
		const child = holder === null ? null : childAt(holder, written, frame)
		if (holder === null || child === null) {
			out.push(...segments.slice(i + 1))
			break
		}
		if (!entered) frame = enterNode(holder, frame)
		here = child
		entered = false
	}
	return out.every((segment, i) => segment === segments[i]) ? null : out
}
