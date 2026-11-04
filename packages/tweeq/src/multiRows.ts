/**
 * Several places in a program that come to the same kind of value, as one thing to
 * edit: what they come to, how that can be one value, and how that value can be pulled
 * out, as a binding that they all refer to. Calls of the same function have such places
 * in each of their arguments, and inputs selected together are such places as they are.
 */

import {
	type AST,
	type Env,
	evaluate,
	infer,
	LetAST,
	lit,
	print,
	solve,
	SymAST,
	typeFits,
	UNSET,
	unwrapLazy,
} from '@glisp/lang'

import { reach, withParent } from './rowsClipboard'
import {
	elementOptionsOf,
	isExpression,
	mentionsTypeVar,
	numberOptionsAt,
	type NumberOptions,
	type Slot,
	textOf,
	titleOf,
	viewOf,
} from './structure'

/** Where a value is: a slot, or a number in the vector that the slot comes to. */
export interface Place {
	readonly path: string
	readonly element: number | null
}

/** One number that each of the rows has. */
export interface MultiField {
	/** Where it is in each row, in the order of the rows. */
	readonly places: readonly Place[]
	/** Of the numbers in a vector, what this one is called. */
	readonly label: string | null
	/** What it would be called, as a binding. */
	readonly name: string
	readonly options: NumberOptions
	/** What it comes to in each row, in the order of the rows. */
	readonly values: readonly number[]
	/** Whether it is written where it can be replaced, in each row. */
	readonly canExtract: boolean
	/** In how many of the rows it is worked out, rather than written as a number. */
	readonly workedOut: 'none' | 'some' | 'all'
}

/** An argument that the rows have, and the numbers in it. */
export interface MultiArgument {
	readonly label: string
	readonly fields: readonly MultiField[]
}

export interface MultiInspection {
	/** The function they are all calls of. */
	readonly fn: string
	/** What that function is called on screen. */
	readonly label: string | null
	/** What that function says its icon is. */
	readonly icon: string | null
	readonly doc: string | null
	readonly args: readonly MultiArgument[]
}

export const MERGES = ['first', 'last', 'ave', 'min', 'max'] as const
export type Merge = (typeof MERGES)[number]

const round = (n: number): number => Math.round(n * 1000) / 1000

/** What the values come to, as one. Only numbers have more to it than which of them. */
export function merged<T>(values: readonly T[], how: Merge): T
export function merged(values: readonly number[], how: Merge): number {
	if (how === 'first') return values[0]!
	if (how === 'last') return values.at(-1)!
	if (how === 'min') return Math.min(...values)
	if (how === 'max') return Math.max(...values)
	return round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

export const isMixed = (values: readonly unknown[]): boolean =>
	values.some(value => value !== values[0])

const elementExpected = (slot: Slot, element: number) => {
	const shape = slot.expected === null ? null : unwrapLazy(slot.expected).shape
	return shape?.kind === 'tuple' ? (shape.elements[element] ?? null) : null
}

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

/** The slots of a row's arguments, and what it is a call of, if it is a call. */
function argsOf(root: AST, env: Env, path: string) {
	const last = reach(root, env, path)?.chain.at(-1)
	if (last === undefined) return null
	const call = bare(last.ast)
	if (call.kind !== 'call') return null
	const view = viewOf(call, last.env)
	return {
		fn: print(call.head),
		label: view.head?.label ?? null,
		icon: view.head?.icon ?? null,
		doc: view.head?.doc ?? null,
		slots: view.slots.filter(slot => slot.key.startsWith('arg')),
	}
}

const isNumbers = (value: unknown): value is number[] =>
	Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'number')

/** Whether what is at a slot, or at the number `element` of it, is worked out. */
function isWorkedOut(slot: Slot, element: number | null): boolean {
	const ast = bare(slot.ast)
	const written = element !== null && ast.kind === 'vec' ? ast.elements[element] : undefined
	return isExpression(written ?? ast)
}

const howWorkedOut = (slots: readonly Slot[], element: number | null): MultiField['workedOut'] => {
	const count = slots.filter(slot => isWorkedOut(slot, element)).length
	return count === 0 ? 'none' : count === slots.length ? 'all' : 'some'
}

/** What the rows at `paths` have in common, or null if they are not calls of the same. */
export function inspectRows(
	root: AST,
	env: Env,
	paths: readonly string[]
): MultiInspection | null {
	const rows = paths.map(path => argsOf(root, env, path))
	const [first] = rows
	if (!first || rows.some(row => row === null || row.fn !== first.fn)) return null
	const others = rows as NonNullable<(typeof rows)[number]>[]
	const placesOf = (key: string, element: number | null): Place[] =>
		paths.map(path => ({ path: `${path}/${key}`, element }))

	const args: MultiArgument[] = first.slots.flatMap((slot, arg) => {
		const slots = others.map(row => row.slots[arg])
		if (slots.some(s => s === undefined)) return []
		const results = (slots as Slot[]).map(s => evaluate(s.ast, s.env).value)

		if (results.every(value => typeof value === 'number')) {
			return [
				{
					label: titleOf(slot),
					fields: [
						{
							places: placesOf(slot.key, null),
							label: null,
							name: slot.label,
							options: numberOptionsAt(slot),
							values: results as number[],
							canExtract: true,
							workedOut: howWorkedOut(slots as Slot[], null),
						},
					],
				},
			]
		}
		const length = isNumbers(results[0]) ? results[0].length : 0
		if (length === 0 || !results.every(r => isNumbers(r) && r.length === length)) return []
		const areWritten = (slots as Slot[]).every(s => bare(s.ast).kind === 'vec')
		const shape = slot.expected
		return [
			{
				label: titleOf(slot),
				fields: Array.from({ length }, (_, element): MultiField => {
					const titled = elementTitle(slot, element)
					return {
						places: placesOf(slot.key, element),
						label: titled,
						name: (titled ?? `${slot.label}${element}`).toLowerCase(),
						options: elementOptionsOf(shape, element),
						values: (results as number[][]).map(r => r[element]!),
						canExtract: areWritten,
						workedOut: howWorkedOut(slots as Slot[], element),
					}
				}),
			},
		]
	})
	return { fn: first.fn, label: first.label, icon: first.icon, doc: first.doc, args }
}

function elementTitle(slot: Slot, element: number): string | null {
	const shape = slot.expected?.shape
	return shape?.kind === 'tuple' ? textOf(shape.elements[element]?.meta?.get('title')) : null
}

const slotAt = (root: AST, env: Env, { path }: Place): Slot | undefined =>
	reach(root, env, path)?.chain.at(-1)

/** What each of the places comes to, if each of them is there. */
export function valuesAt(
	root: AST,
	env: Env,
	places: readonly Place[]
): readonly unknown[] | null {
	const values: unknown[] = []
	for (const place of places) {
		const slot = slotAt(root, env, place)
		if (slot === undefined) return null
		const { value } = evaluate(slot.ast, slot.env)
		values.push(place.element === null ? value : (value as unknown[])[place.element])
	}
	return values
}

/** The program with each of the places coming to its value in `values`. */
export function withValuesAt(
	root: AST,
	env: Env,
	places: readonly Place[],
	values: readonly unknown[]
): { ast: AST | null; problem: string | null } {
	let next = root
	for (const [i, place] of places.entries()) {
		const slot = slotAt(next, env, place)
		if (slot === undefined) return { ast: null, problem: 'that is no longer there' }
		const { element } = place
		const current = evaluate(slot.ast, slot.env).value
		const wanted =
			element === null || !Array.isArray(current)
				? values[i]
				: current.map((_, j) => (j === element ? values[i] : UNSET))
		const { ast, diagnostics } = solve(next, env, slot.ast, wanted)
		if (ast === null) {
			return { ast: null, problem: diagnostics[0]?.message ?? 'cannot be changed' }
		}
		next = ast
	}
	return { ast: next, problem: null }
}

/** Whether one of the places is, or is inside of, another. */
function overlap(places: readonly Place[]): boolean {
	return places.some((a, i) =>
		places.some(
			(b, j) =>
				i !== j &&
				(b.path.startsWith(`${a.path}/`) ||
					(a.path === b.path && (a.element === b.element || a.element === null)))
		)
	)
}

/** Whether each of the places is written where a name can be put in its place. */
export function canExtractAt(root: AST, env: Env, places: readonly Place[]): boolean {
	if (root.kind !== 'let' || places.length === 0 || overlap(places)) return false
	return places.every(place => {
		const slot = slotAt(root, env, place)
		if (slot === undefined) return false
		return place.element === null || bare(slot.ast).kind === 'vec'
	})
}

/** Whether `name` means anything already, where any of `envs` can see it. */
function isBound(name: string, envs: readonly Env[]): boolean {
	return envs.some(env => {
		for (let e = env; e !== null; e = e.parent) {
			if (e.bindings?.has(name)) return true
		}
		return false
	})
}

/** What a binding of what is at the places could be called, going by what they are. */
export function nameFor(root: AST, env: Env, places: readonly Place[]): string {
	const names = new Set(
		places.map(place => {
			const slot = slotAt(root, env, place)
			if (slot === undefined) return ''
			return place.element === null
				? slot.label
				: `${slot.label}${place.element}`
		})
	)
	const [name] = names
	return names.size === 1 && name !== undefined && /^[a-zA-Z_]/.test(name)
		? name.toLowerCase()
		: 'value'
}

/**
 * The program with a new binding of `value`, ahead of what the first of the places is
 * in, that each of them refers to. It is called `name`, or something near it if that
 * would mean something else to any of them. Null if they cannot all be replaced.
 */
export function extractedAt(
	root: AST,
	env: Env,
	places: readonly Place[],
	value: number | string | boolean,
	name: string
): { ast: AST; name: string } | null {
	if (root.kind !== 'let' || !canExtractAt(root, env, places)) return null
	const at = places.map(({ path }) => {
		const [key] = path.split('/')
		return root.bindings.findIndex(([bound]) => `binding:${bound}` === key)
	})
	if (at.some(i => i < 0)) return null

	const envs = places.flatMap(place => {
		const slot = slotAt(root, env, place)
		return slot === undefined ? [] : [slot.env]
	})
	let free = name
	for (let n = 2; isBound(free, envs); n++) free = `${name}${n}`

	let next: AST = root
	for (const { path, element } of places) {
		const suffix = element === null ? '' : `/${element}`
		const reached = reach(next, env, `${path}${suffix}`)
		const last = reached?.chain.at(-1)
		if (!reached || !last) return null
		next = withParent(reached.chain, last.replace(new SymAST(free)))
	}
	if (next.kind !== 'let') return null
	const first = Math.min(...at)
	const bindings = [
		...next.bindings.slice(0, first),
		[free, lit(value)] as const,
		...next.bindings.slice(first),
	]
	return { ast: new LetAST(bindings, next.body), name: free }
}

/** Why `value` cannot be what is at the places, if there is a reason. */
export function misfitAt(
	root: AST,
	env: Env,
	places: readonly Place[],
	value: number | string | boolean
): string | null {
	for (const place of places) {
		const slot = slotAt(root, env, place)
		const expected =
			place.element === null ? slot?.expected : (slot && elementExpected(slot, place.element))
		if (slot === undefined || expected === null || expected === undefined) continue
		const type = infer(lit(value), slot.env)
		if (type !== null && !mentionsTypeVar(expected) && !typeFits(type, expected)) {
			return `${print(lit(value))} does not fit ${expected.typeName}`
		}
	}
	return null
}
