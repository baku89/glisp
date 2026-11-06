/**
 * A program for a test, written as a block of what it draws, in order, as it is drawn: that
 * many tests are about something else, and this is what a program of theirs comes to.
 */

import { type AST, buildPrelude, type LetAST, nameOf, parse as parsed, unnamed } from '@glisp/lang'
import { layersVectorOf } from '@glisp/tweeq/structure'

import { withGraphics } from './graphics'
import { withLayersFromOrder } from './scene'

const env = withGraphics(buildPrelude())

export const parse = (source: string): AST => withLayersFromOrder(parsed(source), env)

/**
 * What a program binds and draws, by name: what only is bound, then what it draws, from the
 * back to the front, which is the order it came about in, as what is new goes in front.
 */
export function bound(ast: AST): (readonly [string, AST])[] {
	const block = (ast.kind === 'meta' ? ast.expr : ast) as LetAST
	const layered = layersVectorOf(block)
	const kept = block.bindings.filter(([name]) => layered === null || layered.name !== name)
	const layers = (layered?.vector.elements ?? []).flatMap(element => {
		const name = nameOf(element)
		return name === null ? [] : [[name, unnamed(element)] as const]
	})
	return [...kept, ...layers.reverse()]
}
