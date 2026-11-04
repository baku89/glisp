/**
 * Several calls of the same function, as one thing to edit: what they have to say to
 * each argument, how that can come to be one value, and how that value can be pulled
 * out, as a binding that they all refer to.
 */

import { type AST, type Env, evaluate, LetAST, lit, print, solve, SymAST, UNSET } from '@glisp/lang'

import { reach, withParent } from './rowsClipboard'
import {
	elementOptionsOf,
	numberOptionsAt,
	type NumberOptions,
	type Slot,
	textOf,
	titleOf,
	viewOf,
} from './structure'

/** One number that each of the rows has. */
export interface MultiField {
	readonly arg: number
	/** Which number in the vector the argument is, if it is one. */
	readonly element: number | null
	/** Of the numbers in a vector, what this one is called. */
	readonly label: string | null
	/** What it would be called, as a binding. */
	readonly name: string
	readonly options: NumberOptions
	/** What it comes to in each row, in the order of the rows. */
	readonly values: readonly number[]
	/** Whether it is written where it can be replaced, in each row. */
	readonly canExtract: boolean
}

/** An argument that the rows have, and the numbers in it. */
export interface MultiArgument {
	readonly label: string
	readonly fields: readonly MultiField[]
}

export interface MultiInspection {
	/** The function they are all calls of. */
	readonly fn: string
	readonly doc: string | null
	readonly args: readonly MultiArgument[]
}

export const MERGES = ['first', 'last', 'ave', 'min', 'max'] as const
export type Merge = (typeof MERGES)[number]

const round = (n: number): number => Math.round(n * 1000) / 1000

/** What the values come to, as one. */
export function merged(values: readonly number[], how: Merge): number {
	if (how === 'first') return values[0]!
	if (how === 'last') return values.at(-1)!
	if (how === 'min') return Math.min(...values)
	if (how === 'max') return Math.max(...values)
	return round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

export const isMixed = (values: readonly number[]): boolean =>
	values.some(value => value !== values[0])

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
		doc: view.head?.doc ?? null,
		slots: view.slots.filter(slot => slot.key.startsWith('arg')),
	}
}

const isNumbers = (value: unknown): value is number[] =>
	Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'number')

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
							arg,
							element: null,
							label: null,
							name: slot.label,
							options: numberOptionsAt(slot),
							values: results as number[],
							canExtract: true,
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
						arg,
						element,
						label: titled,
						name: (titled ?? `${slot.label}${element}`).toLowerCase(),
						options: elementOptionsOf(shape, element),
						values: (results as number[][]).map(r => r[element]!),
						canExtract: areWritten,
					}
				}),
			},
		]
	})
	return { fn: first.fn, doc: first.doc, args }
}

function elementTitle(slot: Slot, element: number): string | null {
	const shape = slot.expected?.shape
	return shape?.kind === 'tuple' ? textOf(shape.elements[element]?.meta?.get('title')) : null
}

/** The program with `field` of each row coming to its value in `values`. */
export function withFieldValues(
	root: AST,
	env: Env,
	paths: readonly string[],
	field: Pick<MultiField, 'arg' | 'element'>,
	values: readonly number[]
): { ast: AST | null; problem: string | null } {
	let next = root
	for (const [i, path] of paths.entries()) {
		const slot = argsOf(next, env, path)?.slots[field.arg]
		if (slot === undefined) return { ast: null, problem: 'that is no longer there' }
		const { element } = field
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

/**
 * The program with a new binding of `value`, ahead of what the first of the rows is in,
 * that `field` of each row refers to. Null if it cannot be replaced.
 */
export function extractedField(
	root: AST,
	env: Env,
	paths: readonly string[],
	field: MultiField,
	value: number
): { ast: AST; name: string } | null {
	if (root.kind !== 'let' || !field.canExtract) return null
	const at = paths.map(path => {
		const [key] = path.split('/')
		return root.bindings.findIndex(([name]) => `binding:${name}` === key)
	})
	if (at.some(i => i < 0)) return null

	const taken = new Set(root.bindings.map(([bound]) => bound))
	let name = field.name
	for (let n = 2; taken.has(name); n++) name = `${field.name}${n}`

	let next: AST = root
	for (const path of paths) {
		const suffix = field.element === null ? '' : `/${field.element}`
		const reached = reach(next, env, `${path}/arg${field.arg}${suffix}`)
		const last = reached?.chain.at(-1)
		if (!reached || !last) return null
		next = withParent(reached.chain, last.replace(new SymAST(name)))
	}
	if (next.kind !== 'let') return null
	const first = Math.min(...at)
	const bindings = [
		...next.bindings.slice(0, first),
		[name, lit(value)] as const,
		...next.bindings.slice(first),
	]
	return { ast: new LetAST(bindings, next.body), name }
}
