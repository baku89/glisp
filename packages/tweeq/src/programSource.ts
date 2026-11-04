/**
 * A whole program as code, a binding to a line. It can only be a block of them, so
 * that goes unsaid.
 */

import { type AST, LetAST, parse, print } from '@glisp/lang'

export const sourceOfProgram = (root: LetAST): string =>
	root.bindings.map(([name, value]) => `${name} = ${print(value)}`).join('\n')

export type ProgramReading =
	| { readonly ast: LetAST }
	| { readonly message: string; readonly offset: number }

const OPENING = '{\n'

/** What is written, as a program, or what is wrong with it, and where. */
export function readProgram(written: string): ProgramReading {
	// With nothing in them, braces are a record.
	if (written.trim() === '') return { ast: new LetAST([], null) }
	let ast: AST
	try {
		ast = parse(`${OPENING}${written}\n}`)
	} catch (error) {
		const { message, position } = error as { message: string; position?: number }
		const at = (position ?? OPENING.length) - OPENING.length
		return { message, offset: Math.min(Math.max(at, 0), written.length) }
	}
	if (ast.kind !== 'let' || ast.body !== null) {
		return { message: 'This can only have bindings.', offset: 0 }
	}
	return { ast: new LetAST(ast.bindings, null) }
}
