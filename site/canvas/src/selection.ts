/**
 * Tweeq's actions know of holes and not of types. This is where they are Glisp's types,
 * and what is selected is a row, along with what it comes to.
 */
import { type AST, buildPrelude, type Env, evaluate, makeType, parse, type TypeValue, typeFits } from '@glisp/lang'
import { slotCommandAt, slotCommandsAt } from '@glisp/tweeq/rowsClipboard'
import { plainTextOf, SLOT_COMMANDS, type SlotCommand } from '@glisp/tweeq/structure'
import { toD } from 'pave/path/svg'
import type { ActionTypes } from 'tweeq'

import {
	isPath,
	isRect,
	isStyled,
	type PathValue,
	pathType,
	type RectValue,
	rectType,
	type StyledValue,
} from './graphics'
import { nameOfRow } from './rows'
import { holdsRows, valueOfRow } from './scene'

export interface Selected {
	readonly row: string
	readonly value: unknown
	/** What can be done to it, which is about what is written, and not what it comes to. */
	readonly commands: ReadonlySet<SlotCommand>
	/** It is a row of its own, and not part of what one is written as. */
	readonly isRow: boolean
}

/** A block with nothing to return comes to `()`, so that a group is told by what is written. */
const GROUP = Symbol('group')

/** What applies to a row. To copy what is only a value is to copy its value, and not two ways. */
function expressionCommandsAt(root: AST, env: Env, row: string): ReadonlySet<SlotCommand> {
	const commands = new Set(slotCommandsAt(root, env, row))
	if (slotCommandAt(root, env, row, 'copy')?.label !== SLOT_COMMANDS.copy.label) {
		commands.delete('copy')
	}
	return commands
}

export const selectedOf = (root: AST, env: Env, rows: readonly string[]): Selected[] =>
	rows.map(row => ({
		row,
		value: holdsRows(root, env, row) ? GROUP : valueOfRow(root, env, row),
		commands: expressionCommandsAt(root, env, row),
		isRow: row.split('/').every(key => /^(binding|element):/.test(key)),
	}))

export const numberType = evaluate(parse('number'), buildPrelude()).value as TypeValue

export const groupType = makeType('group', value => value === GROUP, GROUP)

/** What can be drawn, which, as there are no unions of types, says so of itself. */
export const drawingType = makeType(
	'drawing',
	value => isPath(value) || isStyled(value) || value === GROUP,
	GROUP
)
/** A row of its own, whatever it comes to. */
export const rowType = makeType('row', () => false, null)
/** What can be exported: what is drawn, or an area to export whatever is in. */
export const exportableType = makeType(
	'drawing or rect',
	value => drawingType.fits(value) || rectType.fits(value),
	GROUP
)
const withinRow: readonly TypeValue[] = [exportableType, drawingType, rectType, pathType, groupType]
const withinExportable: readonly TypeValue[] = [drawingType, rectType, pathType, groupType]

/** What one of `SLOT_COMMANDS` applies to. No value says that of itself. */
export const slotTypes = Object.fromEntries(
	Object.keys(SLOT_COMMANDS).map(command => [command, makeType('expression', () => false, null)])
) as Record<SlotCommand, TypeValue>
const commandOf = new Map(
	Object.entries(slotTypes).map(([command, type]) => [type, command as SlotCommand])
)

const fits = (selected: Selected, type: TypeValue): boolean => {
	const command = commandOf.get(type)
	if (command) return selected.commands.has(command)
	if (type === rowType) return selected.isRow
	if (type === drawingType || type === groupType || type === exportableType) {
		return selected.isRow && type.fits(selected.value)
	}
	return type.fits(selected.value)
}

export { pathType, rectType }

/** Where the rows are, for a hole to get them from. */
export interface RowSource {
	/** All there is to fill a hole with. */
	rows(): readonly Selected[]
	/** What is at a place on screen, in a list of rows or drawn. */
	at(x: number, y: number): Selected | null
	/** What a drag from a place on screen would drag. */
	from(x: number, y: number): Selected | null
}

/**
 * A value can say what it is, so that is what is asked, and not what was inferred. A number
 * can be typed in where it is asked for. Anything else is a row, and is pointed at.
 */
export const actionTypesOver = (source: RowSource): ActionTypes<TypeValue, Selected> => ({
	fits,
	// To `typeFits`, `_` means "not known" and fits anything. Here it is as wide as can be.
	narrower: (a, b) =>
		a.typeName !== '_' &&
		(b === rowType
			? withinRow.includes(a)
			: b === exportableType
				? withinExportable.includes(a)
				: b === drawingType
					? a === pathType || a === groupType
					: a === b || (!commandOf.has(a) && a !== rowType && typeFits(a, b))),
	input({ type }) {
		if (type === numberType) return { field: { type: 'number' }, initial: 100 }
		if (!source.rows().some(row => fits(row, type))) return null
		return {
			placeholder: type === rowType ? 'Select' : `Select ${type.typeName}`,
			label: ({ row }) => nameOfRow(row) ?? row,
			at: source.at,
			from: source.from,
		}
	},
})

/**
 * How a value goes on a clipboard, by what it is, the first that fits. What is not here has
 * nothing to say outside of the program, and so there is nothing of it to copy.
 */
const VALUE_TEXTS: ReadonlyArray<{
	readonly fits: (value: unknown) => boolean
	readonly text: (value: never, env: Env) => string
}> = [
	{ fits: isPath, text: ({ path }: PathValue) => toD(path) },
	{ fits: isStyled, text: ({ path: { path } }: StyledValue) => toD(path) },
	{
		fits: isRect,
		text: ({ origin: [x, y], size: [width, height] }: RectValue) => `${x} ${y} ${width} ${height}`,
	},
	{ fits: value => typeof value === 'string', text: (value: string) => value },
	{
		fits: value =>
			typeof value === 'number' ||
			typeof value === 'boolean' ||
			Array.isArray(value) ||
			(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype),
		text: (value: unknown, env) => plainTextOf(value, env),
	},
]

/** The text of what is selected, if it can be copied as a value. */
export const valueTextOf = ({ value }: Selected, env: Env): string | null =>
	VALUE_TEXTS.find(({ fits }) => fits(value))?.text(value as never, env) ?? null

/** What has a text to be copied as. */
export const copyableType = makeType(
	'value',
	value => VALUE_TEXTS.some(({ fits }) => fits(value)),
	null
)
