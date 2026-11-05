/**
 * Inputs selected together, as places in the program: what can be done to them. They
 * say which places they are, and this is what is done to the program about it.
 */

import type { MultiSelectCommand, MultiSelectHost } from 'tweeq/stores/multiSelect'

import type { GlispDocument } from './document'
import {
	canExtractAt,
	differingExpressionsAt,
	extractedAt,
	isMixed,
	type Merge,
	merged,
	MERGES,
	misfitAt,
	nameFor,
	type Place,
	valuesAt,
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

/** What can be done to places with something other than a value written there: moving it. */
function expressionCommands(document: GlispDocument, places: readonly Place[]): MultiSelectCommand[] {
	if (!differingExpressionsAt(document.root.value, document.env.value, places)) return []
	const refer = (from: readonly Place[]): string | void => {
		const { ast, problem } = withReferencesFrom(document.root.value, document.env.value, places, from)
		if (problem !== null) return problem
		if (ast?.kind === 'let') document.setRoot(ast)
	}
	const to = (one: Place): string | void => refer(places.map(() => one))
	return [
		{
			...(places.length === 2
				? { label: 'Swap', icon: 'material-symbols:swap-vert' }
				: { label: 'Rotate', icon: 'material-symbols:rotate-right' }),
			// Each has what the one before it had, and the first what the last had.
			perform: () => refer(places.map((_, i) => places.at(i - 1)!)),
		},
		{
			label: 'Merge',
			icon: 'mdi:call-merge',
			children: [
				{ label: MERGE_LABELS.first, perform: () => to(places[0]!) },
				{ label: MERGE_LABELS.last, perform: () => to(places.at(-1)!) },
			],
		},
	]
}

/** What can be done to the places, as commands that edit the document. */
export function commandsAt(
	document: GlispDocument,
	places: readonly Place[]
): MultiSelectCommand[] {
	const root = document.root.value
	const env = document.env.value
	const values = valuesAt(root, env, places)
	if (places.length >= 2 && values !== null && !values.every(isLiteral)) {
		return expressionCommands(document, places)
	}
	if (
		places.length < 2 ||
		values === null ||
		new Set(values.map(value => typeof value)).size > 1
	) {
		return []
	}
	const literals = values as readonly Literal[]

	// What is not a number can only be one of them.
	const hows = typeof literals[0] === 'number' ? MERGES : (['first', 'last'] as const)
	const options = (perform: (value: Literal) => string | void) =>
		hows.map(how => ({
			label: MERGE_LABELS[how],
			perform: () => perform(merged(literals, how)),
		}))

	const merge = (value: Literal): string | void => {
		const now = document.root.value
		const misfit = misfitAt(now, env, places, value)
		if (misfit !== null) return misfit
		const { ast, problem } = withValuesAt(now, env, places, places.map(() => value))
		if (problem !== null) return problem
		if (ast?.kind === 'let') document.setRoot(ast)
	}

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
		...(mixed
			? [{ label: 'Merge', icon: 'mdi:call-merge', children: options(merge) }]
			: []),
		...(canExtractAt(root, env, places)
			? [
					mixed
						? { label: 'Extract Parameter', icon: 'mdi:variable', children: options(extract) }
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
			commands: selected =>
				commandsAt(
					document,
					selected.flatMap(({ data }) => placesOf(data))
				),
		}
		hosts.set(document, host)
	}
	return host
}
