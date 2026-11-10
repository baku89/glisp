/**
 * Inputs selected together, as places in the program: what can be done to them. They
 * say which places they are, and this is what is done to the program about it.
 */

import { lit, UNIT } from '@glisp/lang'
import type { MultiSelectCommand, MultiSelectHost } from 'tweeq/stores/multiSelect'

import type { GlispDocument } from './document'
import { isExpression } from './structure'
import {
	bindingsAt,
	canExtractAt,
	differingExpressionsAt,
	differingWrittenAt,
	extractedAt,
	isMixed,
	type Merge,
	merged,
	MERGES,
	misfitAt,
	nameFor,
	type Place,
	sharedWrittenAt,
	valuesAt,
	withBindingsMerged,
	withReferencesFrom,
	withValuesAt,
} from './multiRows'

export const MERGE_LABELS: Readonly<Record<Merge, string>> = {
	first: 'First',
	last: 'Last',
	ave: 'Average',
	min: 'Min',
	max: 'Max',
}

type Literal = number | string | boolean

const isLiteral = (value: unknown): value is Literal =>
	typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'

/** An input stands for a place, or for several as a field of several rows does. */
const placesOf = (data: unknown): readonly Place[] =>
	Array.isArray(data) ? (data as Place[]) : data ? [data as Place] : []

/**
 * What kind of thing a value is, for only those of one kind to be done anything to together:
 * a vector, however long, as what does not fit says so itself. What is not known is any kind.
 */
const kindOf = (value: unknown): string | null =>
	Array.isArray(value) ? 'vector' : value === null || value === undefined || value === UNIT ? null : typeof value

/** Each of the places having what is written at the one at the same index of `from`, as one change. */
const referTo =
	(document: GlispDocument, places: readonly Place[]) =>
	(from: readonly Place[]): string | void => {
		const { ast, problem } = withReferencesFrom(document.root.value, document.env.value, places, from)
		if (problem !== null) return problem
		if (ast?.kind === 'let') document.setRoot(ast)
	}

/**
 * The fields selected, each the places it stands for, one to each row of several that it is a
 * field of: what goes from one to another goes from the place of a row to that of the same row.
 * Null if they do not have as many rows as each other.
 */
type Fields = readonly (readonly Place[])[]
const rowsOf = (fields: Fields): number | null => {
	const rows = fields[0]?.length ?? 0
	return rows > 0 && fields.every(field => field.length === rows) ? rows : null
}

/**
 * What is written in each field going on to the next, and from the last to the first, in each
 * row: two trade places, and more are passed along, as balls are in juggling.
 */
function swapCommand(document: GlispDocument, fields: Fields): MultiSelectCommand | null {
	if (rowsOf(fields) === null) return null
	const places = fields.flat()
	const refer = referTo(document, places)
	return {
		...(fields.length === 2
			? { label: 'Swap', icon: 'material-symbols:swap-vert' }
			: { label: 'Pass Along', icon: 'material-symbols:cycle' }),
		// Each has what the one before it had, and the first what the last had, row by row.
		perform: () => refer(fields.flatMap((field, i) => field.map((_, row) => fields.at(i - 1)![row]!))),
	}
}

/** What can be done to places with something other than a value written there: moving it. */
function expressionCommands(document: GlispDocument, fields: Fields): MultiSelectCommand[] {
	const root = document.root.value
	const env = document.env.value
	const places = fields.flat()
	const swap = swapCommand(document, fields)
	if (!differingExpressionsAt(root, env, places)) {
		// Vectors written out, or one written out and one a name, still trade places, as a
		// position and a size do, being of the same shape whatever they mean.
		return swap !== null && differingWrittenAt(root, env, places) ? [swap] : []
	}
	if (swap === null) return []
	const refer = referTo(document, places)
	// Each row's places all have what that row's place in this field has.
	const to = (field: readonly Place[]): string | void => refer(fields.flatMap(each => each.map((_, row) => field[row]!)))
	return [
		swap,
		{
			label: 'Merge',
			icon: 'mdi:call-merge',
			children: [
				{ label: MERGE_LABELS.first, perform: () => to(fields[0]!) },
				{ label: MERGE_LABELS.last, perform: () => to(fields.at(-1)!) },
			],
		},
	]
}

/**
 * What can be done to the places, as commands that edit the document. `fields` are the inputs
 * they are in, if one stands for several, as a field of several rows does: by default, one each.
 */
export function commandsAt(
	document: GlispDocument,
	places: readonly Place[],
	fields: Fields = places.map(place => [place])
): MultiSelectCommand[] {
	const commands = commandsOfPlaces(document, places, fields)
	const bindings = fields.every(field => field.length === 1) ? bindingsAt(places) : null
	if (bindings === null) return commands
	// Bindings merged are one binding, however alike their values: the rest are gone, and what
	// referred to them refers to it. A vector and a number are still not two of anything.
	const values = valuesAt(document.root.value, document.env.value, places)
	if (values !== null && new Set(values.map(kindOf).filter(kind => kind !== null)).size > 1) return commands
	const numbers = values !== null && values.every(value => typeof value === 'number') ? (values as number[]) : null
	const hows = numbers !== null && isMixed(numbers) ? MERGES : (['first', 'last'] as const)
	const merge = (how: Merge): string | void => {
		const keep = how === 'last' ? bindings.names.length - 1 : 0
		const value = how === 'first' || how === 'last' || numbers === null ? undefined : lit(merged(numbers, how))
		const { ast, problem } = withBindingsMerged(document.root.value, document.env.value, bindings.block, bindings.names, keep, value)
		if (problem !== null) return problem
		if (ast?.kind === 'let') document.setRoot(ast)
	}
	const merging: MultiSelectCommand = {
		label: 'Merge',
		icon: 'mdi:call-merge',
		children: hows.map(how => ({ label: MERGE_LABELS[how], perform: () => merge(how) })),
	}
	const at = commands.findIndex(({ label }) => label === 'Merge')
	return at < 0 ? [...commands, merging] : commands.map((command, i) => (i === at ? merging : command))
}

/** What can be done to the places, by what is at them. */
function commandsOfPlaces(
	document: GlispDocument,
	places: readonly Place[],
	fields: Fields
): MultiSelectCommand[] {
	const root = document.root.value
	const env = document.env.value
	const values = valuesAt(root, env, places)
	// Places that all have the same thing written can share it by one name, as numbers can: what is
	// worked out goes by how it is written, and not by the number it comes to.
	const written = places.length < 2 ? null : sharedWrittenAt(root, env, places)
	const asWritten = written !== null && isExpression(written)
	const shared = written !== null && (asWritten || values === null || !values.every(isLiteral)) ? written : null
	const extractShared: MultiSelectCommand[] =
		shared === null
			? []
			: [
					{
						label: 'Extract Parameter',
						icon: 'mdi:variable',
						perform: () => {
							const now = document.root.value
							const result = extractedAt(now, env, places, shared, nameFor(now, env, places))
							if (result === null) return 'that cannot be pulled out from here'
							if (result.ast.kind === 'let') document.setRoot(result.ast)
						},
					},
				]
	return [...extractShared, ...commandsOfValues(document, places, fields, values, !asWritten)]
}

/**
 * What can be done to the places by the values at them, if they are values. `byValue` is whether
 * the number they come to is what there is to pull out, which how they are written may be instead.
 */
function commandsOfValues(
	document: GlispDocument,
	places: readonly Place[],
	fields: Fields,
	values: ReturnType<typeof valuesAt>,
	byValue: boolean
): MultiSelectCommand[] {
	const root = document.root.value
	const env = document.env.value
	// A vector and a number are not two of anything, to swap or to be the same.
	if (values !== null && new Set(values.map(kindOf).filter(kind => kind !== null)).size > 1) return []
	if (fields.length >= 2 && values !== null && !values.every(isLiteral)) {
		return expressionCommands(document, fields)
	}
	if (
		places.length < 2 ||
		values === null ||
		new Set(values.map(value => typeof value)).size > 1
	) {
		return []
	}
	const literals = values as readonly Literal[]
	const rows = rowsOf(fields)
	// The value of each place, by the field it is in and the row it is of.
	const valueAt = (field: number, row: number): Literal => literals[field * rows! + row]!

	// What is not a number can only be one of them.
	const hows = typeof literals[0] === 'number' ? MERGES : (['first', 'last'] as const)
	const options = (perform: (how: Merge) => string | void) =>
		hows.map(how => ({ label: MERGE_LABELS[how], perform: () => perform(how) }))

	/** Each place having what is in `next`, which is by field and then row as `places` are. */
	const write = (next: readonly Literal[]): string | void => {
		const now = document.root.value
		for (const [i, value] of next.entries()) {
			const misfit = misfitAt(now, env, [places[i]!], value)
			if (misfit !== null) return misfit
		}
		const { ast, problem } = withValuesAt(now, env, places, next)
		if (problem !== null) return problem
		if (ast?.kind === 'let') document.setRoot(ast)
	}

	// Row by row, as each row's places are what are the same thing to it.
	const merge = (how: Merge): string | void => {
		if (rows === null) return 'they are not of as many rows as each other'
		const ofRow = Array.from({ length: rows }, (_, row) => merged(fields.map((_, field) => valueAt(field, row)), how))
		return write(fields.flatMap(field => field.map((_, row) => ofRow[row]!)))
	}

	// Each has what the one before it had, and the first what the last had, row by row.
	const swap: MultiSelectCommand[] =
		fields.length >= 2 && rows !== null && literals.some(value => value !== literals[0])
			? [
					{
						...(fields.length === 2
							? { label: 'Swap', icon: 'material-symbols:swap-vert' }
							: { label: 'Pass Along', icon: 'material-symbols:cycle' }),
						perform: () =>
							write(fields.flatMap((field, i) => field.map((_, row) => valueAt((i + fields.length - 1) % fields.length, row)))),
					},
				]
			: []

	const extract = (value: Literal): string | void => {
		const now = document.root.value
		const misfit = misfitAt(now, env, places, value)
		if (misfit !== null) return misfit
		const result = extractedAt(now, env, places, value, nameFor(now, env, places))
		if (result === null) return 'that cannot be pulled out from here'
		if (result.ast.kind === 'let') document.setRoot(result.ast)
	}

	const mixed = isMixed(literals)
	return [
		...swap,
		...(mixed
			? [{ label: 'Merge', icon: 'mdi:call-merge', children: options(merge) }]
			: []),
		...(byValue && canExtractAt(root, env, places)
			? [
					mixed
						? {
								label: 'Extract Parameter',
								icon: 'mdi:variable',
								children: options(how => extract(merged(literals, how))),
							}
						: {
								label: 'Extract Parameter',
								icon: 'mdi:variable',
								perform: () => extract(literals[0]!),
							},
				]
			: []),
	]
}

const hosts = new WeakMap<GlispDocument, MultiSelectHost>()

/** The one host of a document, so that its inputs count as being together. */
export function multiSelectHostOf(document: GlispDocument): MultiSelectHost {
	let host = hosts.get(document)
	if (host === undefined) {
		host = {
			batch: write => document.batch(write),
			commands: selected => {
				const fields = selected.map(({ data }) => placesOf(data))
				return commandsAt(document, fields.flat(), fields)
			},
		}
		hosts.set(document, host)
	}
	return host
}
