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
	freeRefs,
	infer,
	LetAST,
	lit,
	lookupBareName,
	MetaAST,
	pathTarget,
	print,
	readByName,
	mergeBindingIn,
	solve,
	SymAST,
	typeFits,
	UNSET,
	unwrapLazy,
	isPinned,
} from '@glisp/lang'

import { iconOf } from './icons'
import { reach, withParent } from './rowsClipboard'
import {
	elementOptionsOf,
	isExpression,
	layersOf,
	layersVectorOf,
	mentionsTypeVar,
	numberOptionsAt,
	nameOfType,
	type NumberOptions,
	problemOf,
	referenceAt,
	referenceTargetOf,
	type Slot,
	writtenAsType,
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
	/** What the argument is, as a row of one of them shows it: a point, an angle, a number. */
	readonly icon: string | null
	readonly fields: readonly MultiField[]
}

/** A function that some of the rows are calls of, as it is shown. */
export interface MultiHead {
	readonly fn: string
	readonly label: string | null
	readonly icon: string | null
}

export interface MultiInspection {
	/** The function they are all calls of, or nothing where they are calls of several. */
	readonly fn: string
	/** What that function is called on screen, or what each of several is, together. */
	readonly label: string | null
	/** What that function says its icon is. */
	readonly icon: string | null
	readonly doc: string | null
	/** Each function among them, once, in the order of the rows. */
	readonly heads: readonly MultiHead[]
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

/** What is said of the argument by any of the rows, the first that says each thing having it. */
const optionsAcross = (options: readonly NumberOptions[]): NumberOptions =>
	options.reduceRight((all, each) => ({ ...all, ...each }), {} as NumberOptions)

/**
 * The numbers that `slots`, one to each of the rows at `paths`, have as one argument: a number
 * each, or vectors of as many numbers each. Nothing, if they are neither. What is said of it,
 * its limits, icons and what its numbers are called, comes from whichever of the rows says it,
 * the first of them first: a circle's center says it is a point, which a function of its own
 * taking any vector need not.
 */
function argumentOf(paths: readonly string[], slots: readonly Slot[]): MultiArgument | null {
	const [slot] = slots
	if (slot === undefined) return null
	const results = slots.map(s => evaluate(s.ast, s.env).value)
	const placesOf = (element: number | null): Place[] =>
		paths.map((path, i) => ({ path: `${path}/${slots[i]!.key}`, element }))
	const icon = slots.map(s => s.icon ?? iconOf(s.ast, s.env, s.expected)).find(each => each != null) ?? null

	if (results.every(value => typeof value === 'number')) {
		return {
			label: titleOf(slot),
			icon,
			fields: [
				{
					places: placesOf(null),
					label: null,
					name: slot.label,
					options: optionsAcross(slots.map(numberOptionsAt)),
					values: results as number[],
					canExtract: true,
					workedOut: howWorkedOut(slots, null),
				},
			],
		}
	}
	const length = isNumbers(results[0]) ? results[0].length : 0
	if (length === 0 || !results.every(r => isNumbers(r) && r.length === length)) return null
	const areWritten = slots.every(s => bare(s.ast).kind === 'vec')
	return {
		label: titleOf(slot),
		icon,
		fields: Array.from({ length }, (_, element): MultiField => {
			const titled = slots.map(s => elementTitle(s, element)).find(title => title !== null) ?? null
			return {
				places: placesOf(element),
				label: titled,
				name: (titled ?? `${slot.label}${element}`).toLowerCase(),
				options: optionsAcross(slots.map(s => elementOptionsOf(s.expected, element))),
				values: (results as number[][]).map(r => r[element]!),
				canExtract: areWritten,
				workedOut: howWorkedOut(slots, element),
			}
		}),
	}
}

/**
 * What the rows at `paths` have in common: each argument, if they are calls of the same, or
 * else the arguments called the same thing, as a polygon and a circle both have a radius. Null
 * if they are not calls, or have nothing in common but what they come to.
 */
export function inspectRows(
	root: AST,
	env: Env,
	paths: readonly string[]
): MultiInspection | null {
	const rows = paths.map(path => argsOf(root, env, path))
	const [first] = rows
	if (!first || rows.some(row => row === null)) return inspectValues(root, env, paths)
	const others = rows as NonNullable<(typeof rows)[number]>[]
	const same = others.every(row => row.fn === first.fn)

	const args = first.slots.flatMap((slot, arg): MultiArgument[] => {
		// Of one function, an argument is the same by where it is, whatever each is called.
		const slots = others.map(row => (same ? row.slots[arg] : row.slots.find(other => titleOf(other) === titleOf(slot))))
		if (slots.some(s => s === undefined)) return []
		const argument = argumentOf(paths, slots as Slot[])
		return argument === null ? [] : [argument]
	})
	const heads: MultiHead[] = [...new Map(others.map(row => [row.fn, { fn: row.fn, label: row.label, icon: row.icon }])).values()]
	if (same) return { fn: first.fn, label: first.label, icon: first.icon, doc: first.doc, heads, args }
	if (args.length === 0) return inspectValues(root, env, paths)
	// Of several functions, there is no one of them to say what they are, only what each is called.
	const labels = [...new Set(heads.map(head => head.label ?? head.fn))]
	return { fn: '', label: labels.join(', '), icon: null, doc: null, heads, args }
}

/**
 * What the rows at `paths` have in common as what they come to, where they are not calls of one
 * thing: numbers, or vectors of as many numbers, however each is written. Null if they are not.
 */
function inspectValues(root: AST, env: Env, paths: readonly string[]): MultiInspection | null {
	const slots = paths.map(path => reach(root, env, path)?.chain.at(-1))
	if (slots.length < 2 || slots.some(slot => slot === undefined)) return null
	const all = slots as Slot[]
	const values = all.map(slot => evaluate(readByName(slot.ast), slot.env).value)
	const placesOf = (element: number | null): Place[] => paths.map(path => ({ path, element }))
	const written = all.every(slot => !isWorkedOut(slot, null))
	if (values.every(value => typeof value === 'number')) {
		const field: MultiField = {
			places: placesOf(null),
			label: null,
			name: 'value',
			options: numberOptionsAt(all[0]!),
			values: values as number[],
			canExtract: written,
			workedOut: howWorkedOut(all, null),
		}
		return { fn: '', label: 'Numbers', icon: null, doc: null, heads: [], args: [{ label: 'Value', icon: iconOf(all[0]!.ast, all[0]!.env, all[0]!.expected), fields: [field] }] }
	}
	const length = isNumbers(values[0]) ? values[0].length : 0
	if (length === 0 || !values.every(value => isNumbers(value) && value.length === length)) return null
	const areWritten = all.every(slot => bare(slot.ast).kind === 'vec')
	const fields = Array.from({ length }, (_, element): MultiField => ({
		places: placesOf(element),
		label: null,
		name: `value${element}`,
		options: elementOptionsOf(all[0]!.expected, element),
		values: (values as number[][]).map(value => value[element]!),
		canExtract: areWritten,
		workedOut: howWorkedOut(all, element),
	}))
	return { fn: '', label: 'Vectors', icon: null, doc: null, heads: [], args: [{ label: 'Value', icon: iconOf(all[0]!.ast, all[0]!.env, all[0]!.expected), fields }] }
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

/** What a name or a path comes to from `env`, or null if it is neither or comes to nothing. */
function landingOf(ast: AST, env: Env): AST | null {
	const written = bare(ast)
	if (written.kind === 'sym') return lookupBareName(written.name, env)?.ast ?? null
	if (written.kind !== 'path') return null
	const landed = pathTarget(written.segments, env)
	return 'message' in landed ? null : landed.ast
}

/**
 * Whether what is at each of the places is the same thing to each, as what is written can only
 * be moved between them as such: null if any of them is a value, written out or not there.
 */
export function differingExpressionsAt(
	root: AST,
	env: Env,
	places: readonly Place[]
): boolean | null {
	const seen = new Set<AST | string>()
	for (const place of places) {
		const slot = place.element === null ? slotAt(root, env, place) : undefined
		if (slot === undefined || !isExpression(slot.ast)) return null
		seen.add(landingOf(slot.ast, slot.env) ?? print(bare(slot.ast)))
	}
	return seen.size > 1
}

/**
 * Whether anything different is written at the places, whatever it is: a vector written out
 * as well as a name, as anything can trade places with what it fits. Null if one is not there,
 * or is a part of what is written.
 */
export function differingWrittenAt(root: AST, env: Env, places: readonly Place[]): boolean | null {
	const seen = new Set<AST | string>()
	for (const place of places) {
		const slot = place.element === null ? slotAt(root, env, place) : undefined
		if (slot === undefined) return null
		seen.add(landingOf(slot.ast, slot.env) ?? print(bare(slot.ast)))
	}
	return seen.size > 1
}

/**
 * The program with each of the places having what `from` at the same index has, all as they are
 * in `root`, as one change. A name that does not mean the same from there is written so that it
 * does, and if that cannot be, goes around in a circle or does not fit, nothing changes.
 */
export function withReferencesFrom(
	root: AST,
	env: Env,
	places: readonly Place[],
	from: readonly Place[]
): { ast: AST | null; problem: string | null } {
	const gone = { ast: null, problem: 'that is no longer there' }
	const written: AST[] = []
	for (const [i, place] of places.entries()) {
		const slot = slotAt(root, env, place)
		const source = slotAt(root, env, from[i]!)
		if (slot === undefined || source === undefined) return gone
		const landing = landingOf(source.ast, source.env)
		const kind = bare(source.ast).kind
		if (kind !== 'sym' && kind !== 'path') {
			const names = freeRefs(bare(source.ast)).names
			const same = [...names].every(name => lookupBareName(name, slot.env)?.ast === lookupBareName(name, source.env)?.ast)
			if (!same) return { ast: null, problem: `${print(bare(source.ast))} does not mean the same from there` }
			written.push(bare(source.ast))
			continue
		}
		if (landing !== null && landingOf(source.ast, slot.env) === landing) {
			written.push(bare(source.ast))
			continue
		}
		const target = referenceTargetOf(root, env, from[i]!.path)
		const moved = target === null ? null : referenceAt(root, env, place.path, target)
		const reference = moved && slotAt(moved, env, place)
		if (!reference) return { ast: null, problem: `${print(bare(source.ast))} cannot be reached from there` }
		written.push(bare(reference.ast))
	}
	let next = root
	for (const [i, place] of places.entries()) {
		const reached = reach(next, env, place.path)
		const slot = reached?.chain.at(-1)
		if (!reached || !slot) return gone
		const { ast } = slot
		next = withParent(reached.chain, slot.replace(ast.kind === 'meta' ? new MetaAST(ast.metadata, written[i]!) : written[i]!))
	}
	for (const place of places) {
		const slot = slotAt(next, env, place)
		const problem = slot ? problemOf(slot.ast, slot.env, slot.expected, evaluate) : gone.problem
		if (problem !== null) return { ast: null, problem }
	}
	return { ast: next, problem: null }
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
	value: number | string | boolean | AST,
	name: string
): { ast: AST; name: string } | null {
	if (root.kind !== 'let' || !canExtractAt(root, env, places)) return null
	// What is drawn has what it refers to bound ahead of all it draws, where it can see it.
	const layered = layersVectorOf(root)
	const drawnAt = layered === null ? -1 : layered.name === null ? root.bindings.length : root.bindings.findIndex(([bound]) => bound === layered.name)
	const at = places.map(({ path }) => {
		const [key] = path.split('/')
		const bound = root.bindings.findIndex(([name]) => `binding:${name}` === key && name !== layered?.name)
		return bound >= 0 ? bound : layersOf(root).some(name => `binding:${name}` === key) ? drawnAt : -1
	})
	if (at.some(i => i < 0)) return null

	const envs = places.flatMap(place => {
		const slot = slotAt(root, env, place)
		return slot === undefined ? [] : [slot.env]
	})
	let free = name
	for (let n = 2; isBound(free, envs); n++) free = `${name}${n}`
	// With no parameter around it any more, it says for itself what it was to all of them.
	const written = typeof value === 'object' ? value : lit(value)
	const whole = places.flatMap(place => {
		const slot = place.element === null ? slotAt(root, env, place) : undefined
		return slot === undefined ? [] : [slot]
	})
	const typed =
		whole.length === places.length &&
		new Set(whole.map(slot => nameOfType(slot.expected, slot.env))).size === 1
			? writtenAsType(written, whole[0]!.expected, whole[0]!.env)
			: written

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
		[free, typed] as const,
		...next.bindings.slice(first),
	]
	return { ast: new LetAST(bindings, next.body), name: free }
}

/** Whether all there is to something is what is written, with nothing to work out. */
const isWrittenOut = (ast: AST): boolean => {
	const it = bare(ast)
	return it.kind === 'lit' || (it.kind === 'vec' && it.elements.every(isWrittenOut))
}

/**
 * `root` with what is written out at `path` given a name of its own in the program, which is
 * what is there from then on. Null if there is something other than that there, or it has one.
 */
export function extractedLiteralAt(root: AST, env: Env, path: string): { ast: AST; name: string } | null {
	if (!path.includes('/')) return null
	const place: Place = { path, element: null }
	const slot = slotAt(root, env, place)
	if (slot === undefined || !isWrittenOut(slot.ast) || isPinned(slot.ast)) return null
	return extractedAt(root, env, [place], bare(slot.ast), nameFor(root, env, [place]))
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

/** The names of the bindings at `places`, and the path of the block they are all in, if they are that. */
export function bindingsAt(places: readonly Place[]): { readonly block: string; readonly names: readonly string[] } | null {
	const split = places.map(({ path, element }) => (element === null ? /^(?:(.*)\/)?binding:([^/]+)$/.exec(path) : null))
	if (split.length < 2 || split.some(found => found === null)) return null
	const block = split[0]![1] ?? ''
	if (split.some(found => (found![1] ?? '') !== block)) return null
	const names = split.map(found => found![2]!)
	return new Set(names).size === names.length ? { block, names } : null
}

/**
 * `root`, with the bindings `names` of the block at `block` made one: the one at `keep`, where it
 * is, as `value` if that is given, and what referred to any of the others referring to it. A name
 * that would come to mean something else where it is referred to stops it, and says why.
 */
export function withBindingsMerged(
	root: AST,
	env: Env,
	block: string,
	names: readonly string[],
	keep: number,
	value?: AST
): { ast: AST | null; problem: string | null } {
	const blockAt = (ast: AST): LetAST | null => {
		const found = block === '' ? ast : reach(ast, env, block)?.chain.at(-1)?.ast
		const bare = found?.kind === 'meta' ? found.expr : found
		return bare instanceof LetAST ? bare : null
	}
	const withBlock = (ast: AST, next: LetAST): AST | null => {
		if (block === '') return next
		const reached = reach(ast, env, block)
		const last = reached?.chain.at(-1)
		return reached && last ? withParent(reached.chain, last.replace(last.ast.kind === 'meta' ? new MetaAST(last.ast.metadata, next) : next)) : null
	}
	const kept = names[keep]!
	let next: AST | null = root
	for (const other of names.filter((_, i) => i !== keep)) {
		const into = blockAt(next!)
		const joined: AST | null = into === null ? null : mergeBindingIn(next!, into, other, kept)
		if (!joined) return { ast: null, problem: `${other} cannot be ${kept} everywhere it is referred to` }
		next = joined
	}
	if (value !== undefined) {
		const into = blockAt(next!)!
		next = withBlock(next!, new LetAST(into.bindings.map(([name, was]) => [name, name === kept ? value : was] as const), into.body))
		if (next === null) return { ast: null, problem: 'they are not where they were' }
	}
	return { ast: next, problem: null }
}
