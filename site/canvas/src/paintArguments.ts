/**
 * What a style says, as the arguments they are. A field for one is a way of getting at
 * that argument, which can be referred to, can refer to something else, and when it does,
 * has what it refers to change along with it.
 */

import { type AST, type Env, print, solve, toAst } from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { isExpression, referenceAt, viewOf } from '@glisp/tweeq/structure'

import { NO_PAINT, type Paint, PAINT_KEYS } from './graphics'
import { paintAt, withPaint } from './scene'

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

/** The row of what `row` says of `key`, by name or by place, or null if it does not say. */
export function paintArgument(
	root: AST,
	env: Env,
	row: string,
	key: keyof Paint
): string | null {
	const last = reach(root, env, row)?.chain.at(-1)
	if (last === undefined) return null
	const node = bare(last.ast)
	if (node.kind !== 'call' || print(node.head) !== 'style') return null
	const { slots } = viewOf(last.ast, last.env)
	const place = `arg${PAINT_KEYS.indexOf(key) + 1}`
	const slot = slots.find(s => s.key === `kw:${key}`) ?? slots.find(s => s.key === place)
	return slot === undefined ? null : `${row}/${slot.key}`
}

/**
 * `root`, with `row` drawn with `part`: where it says so by way of something else, that
 * something else comes to it, if it can.
 */
export function withPaintThrough(root: AST, env: Env, row: string, part: Partial<Paint>): AST {
	let program = root
	for (const [key, value] of Object.entries(part)) {
		const at = paintArgument(program, env, row, key as keyof Paint)
		const argument = at === null ? undefined : reach(program, env, at)?.chain.at(-1)?.ast
		const solved =
			argument !== undefined && isExpression(argument)
				? solve(program, env, argument, value).ast
				: null
		program = solved ?? withPaint(program, env, row, { [key]: value })
	}
	return program
}

const DEFAULT_WIDTH = 1

/** What a color to a line comes with: a line of no width is not there to see. */
export const strokeWithWidth = (stroke: string, width: number): Partial<Paint> =>
	stroke === 'none' || width > 0 ? { stroke } : { stroke, width: DEFAULT_WIDTH }

/**
 * `root`, with each of `rows` having the color of its fill as its line and the other way, as they
 * are, none included. What there is comes first, for there never to be neither, which is no style
 * at all, and would be the end of what else it says.
 */
export function withPaintsSwapped(root: AST, env: Env, rows: readonly string[]): AST {
	return [...new Set(rows)].reduce((program, row) => {
		const { fill, stroke, width } = paintAt(program, env, row) ?? NO_PAINT
		if (fill === stroke) return program
		const line = strokeWithWidth(fill, width)
		return withPaintThrough(program, env, row, fill === 'none' ? { fill: stroke, ...line } : { ...line, fill: stroke })
	}, root)
}

/** What `row` says of `key` as code, which is what it comes to if it does not say. */
export function paintSource(root: AST, env: Env, row: string, key: keyof Paint): string | null {
	const at = paintArgument(root, env, row, key)
	const said = at === null ? undefined : reach(root, env, at)?.chain.at(-1)?.ast
	if (said !== undefined) return print(said)
	const paint = paintAt(root, env, row)
	return paint === null ? null : print(toAst(paint[key], null))
}

/** Only for it to be there to replace. It is never what a style would say anyway. */
const SAID = 'said'

/** `root`, with `row` saying something of `key` for sure, and where that is. */
function sayingPaint(
	root: AST,
	env: Env,
	row: string,
	key: keyof Paint
): { program: AST; at: string } | null {
	const program =
		paintArgument(root, env, row, key) === null
			? withPaint(root, env, row, { [key]: SAID })
			: root
	const at = paintArgument(program, env, row, key)
	return at === null ? null : { program, at }
}

/** `root`, with what `row` says of `key` referring to the row at `target`, said or not. */
export function paintReferringTo(
	root: AST,
	env: Env,
	row: string,
	key: keyof Paint,
	target: string
): AST | null {
	const saying = sayingPaint(root, env, row, key)
	return saying && referenceAt(saying.program, env, saying.at, target)
}

/** `root`, with what `row` says of `key` being `code`, said or not. */
export function paintWritten(
	root: AST,
	env: Env,
	row: string,
	key: keyof Paint,
	code: AST
): AST | null {
	const saying = sayingPaint(root, env, row, key)
	const chain = saying && reach(saying.program, env, saying.at)?.chain
	const last = chain?.at(-1)
	return chain && last ? withParent(chain, last.replace(code)) : null
}
