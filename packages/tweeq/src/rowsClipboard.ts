/**
 * Bindings on a clipboard: `name = expression`, a line to each, which is what a program
 * is written as too, and so what reads as more of them when it is pasted.
 */

import { type AST, type Env, LetAST, print } from '@glisp/lang'

import { readProgram } from './programSource'
import { type Slot, viewOf } from './structure'

const BINDING = 'binding:'

interface Reached {
	readonly chain: readonly Slot[]
	/** What holds the last of the chain. */
	readonly parent: AST
}

function reach(root: AST, env: Env, path: string): Reached | null {
	const chain: Slot[] = []
	let node = root
	let nodeEnv = env
	let parent = root
	for (const key of path.split('/')) {
		const slots: readonly Slot[] = viewOf(node, nodeEnv).slots
		const slot = slots.find(s => s.key === key)
		if (slot === undefined) return null
		chain.push(slot)
		parent = node
		node = slot.ast
		nodeEnv = slot.env
	}
	return { chain, parent }
}

/** The program, with what holds the end of `chain` now `next`. */
function withParent(chain: readonly Slot[], next: AST): AST {
	let node = next
	for (let i = chain.length - 2; i >= 0; i--) node = chain[i]!.replace(node)
	return node
}

const isBinding = (path: string): boolean =>
	path.split('/').at(-1)!.startsWith(BINDING)

/** What to put on the clipboard for the rows at `paths`. */
export function copiedRows(root: AST, env: Env, paths: readonly string[]): string {
	return paths
		.filter(isBinding)
		.flatMap(path => {
			const last = reach(root, env, path)?.chain.at(-1)
			return last ? [`${last.key.slice(BINDING.length)} = ${print(last.ast)}`] : []
		})
		.join('\n')
}

/** The program without the rows at `paths`, those that can go. */
export function withoutRows(root: AST, env: Env, paths: readonly string[]): AST {
	return paths.reduce<AST>((next, path) => {
		const reached = reach(next, env, path)
		const removed = reached?.chain.at(-1)?.remove?.()
		return reached && removed ? withParent(reached.chain, removed) : next
	}, root)
}

/** `name`, or the next of its kind if that is taken: `c` is followed by `c2`. */
function freeName(name: string, taken: ReadonlySet<string>): string {
	if (!taken.has(name)) return name
	const [, stem, digits] = /^(.*?)(\d*)$/.exec(name)!
	let n = digits === '' ? 2 : Number(digits) + 1
	while (taken.has(`${stem}${n}`)) n++
	return `${stem}${n}`
}

/**
 * The program with what is on the clipboard as more bindings: after the row at `after`,
 * in what holds it, or else at the end. Null if it does not read as bindings. They refer
 * to what they referred to, and to each other under the names they have now.
 */
export function pastedRows(
	root: AST,
	env: Env,
	after: string | null,
	text: string
): { ast: AST; paths: string[] } | null {
	const reading = readProgram(text)
	if (!('ast' in reading) || reading.ast.bindings.length === 0) return null

	const reached = after !== null && isBinding(after) ? reach(root, env, after) : null
	const holder = reached?.parent.kind === 'let' ? reached.parent : root
	if (holder.kind !== 'let') return null
	const placed = reached?.parent.kind === 'let' ? reached : null

	const taken = new Set(holder.bindings.map(([name]) => name))
	const added = reading.ast.bindings.map(([name, value]) => {
		const free = freeName(name, taken)
		taken.add(free)
		return [free, value] as const
	})

	const afterName = placed?.chain.at(-1)?.key.slice(BINDING.length)
	const found = holder.bindings.findIndex(([name]) => name === afterName)
	const at = found < 0 ? holder.bindings.length : found + 1
	const bindings = [...holder.bindings.slice(0, at), ...added, ...holder.bindings.slice(at)]
	const next = new LetAST(bindings, holder.body)

	const prefix = placed ? after!.split('/').slice(0, -1) : []
	return {
		ast: placed ? withParent(placed.chain, next) : next,
		paths: added.map(([name]) => [...prefix, `${BINDING}${name}`].join('/')),
	}
}
