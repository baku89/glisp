/**
 * Putting a node into a call, or letting it out of one: an edit that moves it a level
 * down or up, so that paths, which count levels, say something else if nothing is done.
 * These have them come to what they came to, and what is unchanged stays `===`.
 *
 * A path going by way of the node goes by way of the call too: `a/center` is
 * `a/path/center` once `a` is in a call with a parameter `path`, and what climbs out of
 * the node has one more level to climb. A name goes on naming the binding, unless what
 * it is given to has no use for what the call comes to: then it goes to what is held too.
 * A path from the root climbs nothing, so only what it goes by way of counts.
 */

import { desugar } from './desugar.js'
import { childAt, enterNode, isKeySegment, keySegment, lookupBareName, rootFrame, typeFits } from './eval.js'
import { expectedTypeAt } from './expectedType.js'
import { callParameters, infer } from './infer.js'
import {
	AccessAST,
	type AST,
	CallAST,
	type Env,
	FnAST,
	LetAST,
	MetaAST,
	PathAST,
	RecordAST,
	SpreadAST,
	SymAST,
	UnquoteAST,
	VecAST,
	withoutMeta,
} from './types.js'

type Segments = PathAST['segments']

/** Every path in `root` as `follow` has it, `call` being as `atCall` has it. */
function withPaths(
	root: AST,
	env: Env,
	call: CallAST | null,
	follow: (path: PathAST, frame: Env) => AST,
	atCall: (frame: Env, go: (node: AST, frame: Env) => AST) => AST,
	given: (name: SymAST, to: CallAST, slot: number | string, frame: Env) => AST = name => name
): AST {
	let edits = 0

	const rebuild = (node: AST, outer: Env): AST => {
		if (node === call) {
			edits++
			return atCall(outer, go)
		}
		// `%` makes the node the body of a function, which a path counts as a level.
		const sugar = node.kind === 'fn' ? node : desugar(node)
		const frame = sugar.kind === 'fn' && node.kind !== 'fn' ? enterNode(sugar, outer) : outer
		const inside = (): Env => enterNode(node, frame)

		switch (node.kind) {
			case 'path': {
				const next = follow(node, frame)
				if (next !== node) edits++
				return next
			}
			case 'call': {
				const at = inside()
				const argument = (arg: AST, slot: number | string): AST => {
					if (arg.kind !== 'sym') return go(arg, at)
					const next = given(arg, node, slot, at)
					if (next !== arg) edits++
					return next
				}
				return new CallAST(
					go(node.head, at),
					node.args.map(argument),
					node.kwargs && new Map([...node.kwargs].map(([k, v]) => [k, argument(v, k)]))
				)
			}
			case 'vec': {
				const at = inside()
				return new VecAST(node.elements.map(element => go(element, at)))
			}
			case 'record': {
				const at = inside()
				return new RecordAST(
					node.fields.map(field =>
						'kind' in field
							? new SpreadAST(go(field.expr, at))
							: ([field[0], go(field[1], at)] as const)
					),
					node.optional
				)
			}
			case 'let': {
				const at = inside()
				return new LetAST(
					node.bindings.map(([name, value]) => [name, go(value, at)] as const),
					node.body === null ? null : go(node.body, at)
				)
			}
			case 'fn': {
				const at = inside()
				// A parameter's type is read before any argument is bound.
				const types = node.generics.length > 0 ? at : frame
				return new FnAST(
					node.generics,
					node.params.map(p => ({ ...p, type: go(p.type, types) })),
					go(node.returnType, types),
					node.body === null ? null : go(node.body, at)
				)
			}
			case 'access':
				return new AccessAST(go(node.target, frame), node.key)
			case 'meta':
				return new MetaAST(go(node.metadata, frame) as RecordAST, go(node.expr, frame))
			case 'spread':
				return new SpreadAST(go(node.expr, frame))
			case 'unquote':
				return new UnquoteAST(go(node.expr, frame))
			default:
				return node
		}
	}

	const go = (node: AST, frame: Env): AST => {
		const before = edits
		const next = rebuild(node, frame)
		return edits === before ? node : next
	}

	return go(root, env)
}

const unchangedOr = (path: PathAST, segments: Segments): PathAST =>
	segments.length === path.segments.length ? path : new PathAST(segments)

/** The shortest written of these paths, the earliest of those as short. */
export function shortestPath(first: PathAST, ...others: readonly PathAST[]): PathAST {
	return others.reduce(
		(best, path) => (path.print().length < best.print().length ? path : best),
		first
	)
}

/**
 * The names a path from the root goes by to reach `frame`'s node, or null if no path
 * reaches it, as nothing does inside a function.
 */
function fromRootTo(frame: Env): Segments | null {
	const root = rootFrame(frame)
	const levels: Array<Segments[number]> = []
	for (let at = frame; at !== root; at = at.parent) {
		if (at === null || at.parent === null) return null
		const level = levelOf(at.parent, at.ast)
		if (level === null) return null
		levels.unshift(level)
	}
	return levels
}

/** What a path says to go from the node of `frame` to its child `node`. */
function levelOf(frame: NonNullable<Env>, node: AST): Segments[number] | null {
	const holder = withoutMeta(frame.ast)
	const is = (child: AST | undefined) => child !== undefined && withoutMeta(child) === node
	if (holder.kind === 'let') return holder.bindings.find(([, value]) => is(value))?.[0] ?? null
	if (holder.kind === 'vec') {
		const index = holder.elements.findIndex(is)
		return index === -1 ? null : index
	}
	if (holder.kind === 'record') {
		for (const field of holder.fields) {
			if (!('kind' in field) && is(field[1])) return keySegment(field[0])
		}
		return null
	}
	if (holder.kind !== 'call') return null
	for (const [name, value] of holder.kwargs ?? []) if (is(value)) return keySegment(name)
	const name = callParameters(holder, frame)?.names[holder.args.findIndex(is)]
	return name === undefined ? null : keySegment(name)
}

/**
 * `root`, with what is at `from`, names from the root, now being at `to`: paths from the root
 * that go by way of it go there. No other path counts, as what they count is levels.
 */
export function withPathsMoved(
	root: AST,
	env: Env,
	from: readonly (string | number)[],
	to: readonly (string | number)[]
): AST {
	const follow = (path: PathAST): PathAST => {
		const [start, ...rest] = path.segments
		const goes = start === '/' && from.every((level, i) => rest[i] === level)
		return goes ? new PathAST(['/', ...to, ...rest.slice(from.length)]) : path
	}
	return withPaths(root, env, null, follow, () => root)
}

/** What a call's first parameter is called, in `root`. */
function firstParameter(root: AST, env: Env, call: CallAST): string | null {
	let name: string | null = null
	withPaths(
		root,
		env,
		call,
		path => path,
		frame => {
			name = callParameters(call, enterNode(call, frame))?.names[0] ?? null
			return call
		}
	)
	return name
}

/**
 * `root`, in which `call` has just been put where its first argument was, with paths
 * coming to what they came to before. `root` as it is if the parameter has no name.
 */
export function withPathsInto(root: AST, env: Env, call: CallAST): AST {
	const held = call.args[0]
	const parameter = firstParameter(root, env, call)
	if (held === undefined || parameter === null) return root

	const follow = (path: PathAST, start: Env): PathAST => {
		const out: Array<Segments[number]> = []
		let frame = start
		let here: AST | null = frame?.ast ?? null
		let entered = true
		/** Past `call`, which was not there to be gone through. */
		const skipCall = (): void => {
			if (frame?.ast !== call) return
			frame = frame.parent
			here = frame?.ast ?? null
			out.push('..')
		}
		// The node itself being the path, it stood where `call` does now.
		if (path.segments[0] !== '/') skipCall()
		for (const segment of path.segments) {
			if (segment === '/') {
				frame = rootFrame(start)
				here = frame?.ast ?? null
				entered = true
				out.push('/')
				continue
			}
			if (segment === '..') {
				if (entered) {
					if (frame === null) return path
					frame = frame.parent
				}
				here = frame?.ast ?? null
				entered = true
				out.push('..')
				skipCall()
				continue
			}
			if (here === null) return path
			const holder: AST = withoutMeta(here)
			const child = childAt(holder, segment, frame)
			if (child === null) return path
			if (!entered) frame = enterNode(holder, frame)
			here = child
			entered = false
			out.push(segment)
			if (withoutMeta(child) === call) {
				frame = enterNode(call, frame)
				here = held
				out.push(keySegment(parameter))
			}
		}
		return unchangedOr(path, out)
	}

	/** The name, as a path to what is held, if where it is given has no use for the call. */
	const given = (name: SymAST, to: CallAST, slot: number | string, frame: Env): AST => {
		const target = lookupBareName(name.name, frame)
		if (target === null || withoutMeta(target.ast) !== call) return name
		const expected = expectedTypeAt(to, slot, frame)
		const made = infer(call, target.env)
		if (expected === null || made === null || typeFits(made, expected)) return name
		const climbs: Array<Segments[number]> = []
		for (let at = frame; at !== null; at = at.parent) {
			const { ast } = at
			if (ast.kind === 'fn' && ast.params.some(p => p.name === name.name)) return name
			if (ast.kind === 'let' && ast.bindings.some(([, value]) => value === target.ast)) {
				const relative = new PathAST([...climbs, name.name, keySegment(parameter)])
				const levels = fromRootTo(at)
				return levels === null
					? relative
					: shortestPath(relative, new PathAST(['/', ...levels, name.name, keySegment(parameter)]))
			}
			climbs.push('..')
		}
		return name
	}

	return withPaths(
		root,
		env,
		call,
		follow,
		(frame, go) => {
			const args = [...call.args]
			args[0] = go(held, enterNode(call, frame))
			return new CallAST(call.head, args, call.kwargs)
		},
		given
	)
}

/**
 * `root`, with `call`, somewhere in it, replaced by its first argument, and paths coming to
 * what they came to, by name if it is now only that. What led to anything else of the call
 * has nothing left to lead to, and stays as it is. `null` if there is no first argument.
 */
export function withoutCall(root: AST, env: Env, call: CallAST): AST | null {
	const held = call.args[0]
	if (held === undefined) return null
	const parameter = firstParameter(root, env, call)

	const follow = (path: PathAST, start: Env): AST => {
		const out: Array<Segments[number]> = []
		let frame = start
		let here: AST | null = frame?.ast ?? null
		let entered = true
		/** The first climb of a path that was the argument itself: it is where that went. */
		let owed = frame?.ast === call && path.segments[0] !== '/'
		for (const segment of path.segments) {
			if (segment === '/') {
				frame = rootFrame(start)
				here = frame?.ast ?? null
				entered = true
				out.push('/')
				continue
			}
			if (segment === '..') {
				if (entered) {
					if (frame === null) return path
					frame = frame.parent
				}
				here = frame?.ast ?? null
				entered = true
				if (owed) owed = false
				else if (frame?.ast !== call) out.push('..')
				continue
			}
			if (here === null) return path
			const holder: AST = withoutMeta(here)
			if (holder === call && (parameter === null || segment !== keySegment(parameter))) return path
			const child = childAt(holder, segment, frame)
			if (child === null) return path
			if (!entered) frame = enterNode(holder, frame)
			here = child
			entered = false
			if (holder !== call) out.push(segment)
		}
		if (out.length === 0 || out.at(-1) === '/') return path
		const name = out.at(-1)
		const isName =
			out.length < path.segments.length &&
			here === held &&
			typeof name === 'string' &&
			!isKeySegment(name) &&
			out.slice(0, -1).every(segment => segment === '..' || segment === '/') &&
			withoutMeta(lookupBareName(name, start)?.ast ?? held) === call
		return isName ? new SymAST(name) : unchangedOr(path, out)
	}

	return withPaths(root, env, call, follow, (frame, go) => go(held, enterNode(call, frame)))
}
