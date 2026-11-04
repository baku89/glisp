/**
 * Bindings on a clipboard: `name = expression`, a line to each, which is what a program
 * is written as too, and so what reads as more of them when it is pasted. A parameter is
 * copied the same way, by its name, and so can find one like it, or be a binding itself.
 */

import {
	argFits,
	type AST,
	type Env,
	infer,
	LetAST,
	lookupBareName,
	MetaAST,
	print,
	type TypeValue,
} from '@glisp/lang'

import { readProgram } from './programSource'
import { actionsOf, type Slot, viewOf, type SlotAction, type SlotCommand } from './structure'

const BINDING = 'binding:'

interface Reached {
	readonly chain: readonly Slot[]
	/** What holds the last of the chain. */
	readonly parent: AST
}

export function reach(root: AST, env: Env, path: string): Reached | null {
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
export function withParent(chain: readonly Slot[], next: AST): AST {
	let node = next
	for (let i = chain.length - 2; i >= 0; i--) node = chain[i]!.replace(node)
	return node
}

/** That one of `SLOT_COMMANDS` as it is for the row at `path`, if it applies there. */
export function slotCommandAt(
	root: AST,
	env: Env,
	path: string,
	command: SlotCommand
): SlotAction | null {
	const slot = reach(root, env, path)?.chain.at(-1)
	return (slot && actionsOf(slot).find(({ id }) => id === command)) ?? null
}

/** Which of `SLOT_COMMANDS` apply to the row at `path`. */
export function slotCommandsAt(root: AST, env: Env, path: string): ReadonlySet<SlotCommand> {
	const slot = reach(root, env, path)?.chain.at(-1)
	return new Set(slot ? actionsOf(slot).flatMap(({ id }) => id ?? []) : [])
}

/** The program with that done to `rows`. Null if that makes no difference to any of them. */
export function withSlotCommand(
	root: AST,
	env: Env,
	rows: readonly string[],
	command: SlotCommand
): AST | null {
	let next = root
	for (const row of rows) {
		if (command === 'delete') {
			next = withoutNearest(next, env, row) ?? next
			continue
		}
		const chain = reach(next, env, row)?.chain
		const action = chain?.at(-1) && actionsOf(chain.at(-1)!).find(({ id }) => id === command)
		if (chain && action && 'apply' in action) next = withParent(chain, action.apply())
	}
	return print(next) === print(root) ? null : next
}

/** What that puts on the clipboard for `rows`, a line to each. */
export function copiedBySlotCommand(
	root: AST,
	env: Env,
	rows: readonly string[],
	command: SlotCommand
): string {
	return rows
		.flatMap(row => {
			const action = slotCommandAt(root, env, row, command)
			return action && 'copy' in action ? [action.copy()] : []
		})
		.join('\n')
}

/**
 * The program without the row at `path`, or if that cannot go, without the nearest of
 * what holds it that can: a part that is needed is deleted by deleting what needs it.
 */
export function withoutNearest(root: AST, env: Env, path: string): AST | null {
	const chain = reach(root, env, path)?.chain ?? []
	for (let i = chain.length - 1; i >= 0; i--) {
		const removed = chain[i]!.remove?.()
		if (removed !== undefined) return withParent(chain.slice(0, i + 1), removed)
	}
	return null
}

const isBindingKey = (key: string): boolean => key.startsWith(BINDING)

/** The binding that the row at `path` is in, or is. */
function bindingOfRow(path: string): string | null {
	const keys = path.split('/')
	while (keys.length > 0 && !isBindingKey(keys.at(-1)!)) keys.pop()
	return keys.length === 0 ? null : keys.join('/')
}

const nameOfSlot = (slot: Slot): string | null =>
	isBindingKey(slot.key) ? slot.key.slice(BINDING.length) : (slot.parameter ?? null)

/** What to put on the clipboard for the rows at `paths`: those that go by a name. */
export function copiedRows(root: AST, env: Env, paths: readonly string[]): string {
	return paths
		.flatMap(path => {
			const last = reach(root, env, path)?.chain.at(-1)
			const name = last && nameOfSlot(last)
			return last && name ? [`${name} = ${print(last.ast)}`] : []
		})
		.join('\n')
}

/** A parameter that a value could be given, under a row. */
interface Place {
	readonly name: string
	readonly expected: TypeValue | null
	readonly env: Env
	/** The program, with the parameter being `value`. */
	put(value: AST): AST
}

const isArgument = (slot: Slot): boolean => /^(arg|kw:|field:)/.test(slot.key)

/** What is said about what is in a place stays there, whatever comes to be in it. */
function keepingMeta(current: AST, next: AST): AST {
	if (current.kind !== 'meta') return next
	return new MetaAST(current.metadata, next.kind === 'meta' ? next.expr : next)
}

/** The parameters of what a row comes to, and of what it is made of, the nearest first. */
function placesIn(row: Slot, program: (node: AST) => AST): Place[] {
	const places: Place[] = []
	const queue = [{ ast: row.ast, env: row.env, expected: row.expected, program }]
	for (const { ast, env, expected, program } of queue) {
		const view = viewOf(ast, env, expected)
		for (const slot of view.slots) {
			if (!isArgument(slot)) continue
			const within = (child: AST) => program(slot.replace(child))
			if (slot.parameter !== undefined) {
				places.push({
					name: slot.parameter,
					expected: slot.expected,
					env: slot.env,
					put: value => within(keepingMeta(slot.ast, value)),
				})
			}
			queue.push({ ast: slot.ast, env: slot.env, expected: slot.expected, program: within })
		}
		for (const missing of view.missing) {
			places.push({
				name: missing.parameter,
				expected: missing.expected,
				env,
				put: value => program(missing.give(value)),
			})
		}
	}
	return places
}

function fits(value: AST, expected: TypeValue | null, env: Env): boolean {
	if (expected === null) return true
	const type = infer(value, env)
	return type === null || argFits(value, type, expected)
}

/**
 * The program with `value` where the row at `path` has a place for it. By name, among the
 * parameters of what the row is made of. Or else in the row itself, which was chosen by
 * hand, if `alone` says that nothing else is coming to it too.
 */
function landed(
	root: AST,
	env: Env,
	path: string,
	name: string,
	value: AST,
	alone: boolean
): AST | null {
	const chain = reach(root, env, path)?.chain
	const row = chain?.at(-1)
	if (!chain || !row) return null
	const program = (node: AST) => withParent(chain, row.replace(node))
	const places = placesIn(row, program).filter(place => fits(value, place.expected, place.env))

	const named = places.find(place => place.name === name)
	if (named) return named.put(value)
	return alone && !isBindingKey(row.key) && fits(value, row.expected, row.env)
		? program(keepingMeta(row.ast, value))
		: null
}

/**
 * The program with what is on the clipboard given to the rows at `paths`, each of which
 * has a place for all of it, or null if none does.
 */
export function pastedArguments(
	root: AST,
	env: Env,
	paths: readonly string[],
	text: string
): AST | null {
	const reading = readProgram(text)
	if (!('ast' in reading) || reading.ast.bindings.length === 0) return null
	const { bindings } = reading.ast

	let next: AST | null = null
	for (const path of paths) {
		const given: AST | null = bindings.reduce<AST | null>(
			(program, [name, value]) =>
				program && landed(program, env, path, name, value, bindings.length === 1),
			next ?? root
		)
		if (given !== null) next = given
	}
	return next
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
function freeName(name: string, isTaken: (name: string) => boolean): string {
	if (!isTaken(name)) return name
	const [, stem, digits] = /^(.*?)(\d*)$/.exec(name)!
	let n = digits === '' ? 2 : Number(digits) + 1
	while (isTaken(`${stem}${n}`)) n++
	return `${stem}${n}`
}

/**
 * The program with what is on the clipboard as more bindings: after the binding that the
 * row at `after` is in, in what holds it, or else at the end. Null if it does not read as
 * bindings. They refer to what they referred to, and to each other under the names they
 * have now, none of which hides anything that can be seen from there.
 */
export function pastedRows(
	root: AST,
	env: Env,
	after: string | null,
	text: string
): { ast: AST; paths: string[] } | null {
	const reading = readProgram(text)
	if (!('ast' in reading) || reading.ast.bindings.length === 0) return null

	const binding = after === null ? null : bindingOfRow(after)
	const reached = binding === null ? null : reach(root, env, binding)
	const holder = reached?.parent.kind === 'let' ? reached.parent : root
	if (holder.kind !== 'let') return null
	const placed = reached?.parent.kind === 'let' ? reached : null

	const taken = new Set(holder.bindings.map(([name]) => name))
	const seenFrom = placed?.chain.at(-1)?.env ?? env
	const isTaken = (name: string) => taken.has(name) || lookupBareName(name, seenFrom) !== null
	const added = reading.ast.bindings.map(([name, value]) => {
		const free = freeName(name, isTaken)
		taken.add(free)
		return [free, value] as const
	})

	const afterName = placed?.chain.at(-1)?.key.slice(BINDING.length)
	const found = holder.bindings.findIndex(([name]) => name === afterName)
	const at = found < 0 ? holder.bindings.length : found + 1
	const bindings = [...holder.bindings.slice(0, at), ...added, ...holder.bindings.slice(at)]
	const next = new LetAST(bindings, holder.body)

	const prefix = placed ? binding!.split('/').slice(0, -1) : []
	return {
		ast: placed ? withParent(placed.chain, next) : next,
		paths: added.map(([name]) => [...prefix, `${BINDING}${name}`].join('/')),
	}
}
