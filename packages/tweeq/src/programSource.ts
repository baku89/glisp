/**
 * A whole program as code, a binding to a line. It can only be a block of them, so
 * that goes unsaid.
 */

import { type AST, type Env, LetAST, parse, print } from '@glisp/lang'

import { layersOf, viewOf, type Slot } from './structure'

/** What is only bound, a binding to a line, and then what the program's vector holds, one to a line. */
export function sourceOfProgram(root: LetAST): string {
	const held = new Set(layersOf(root))
	const lines = root.bindings
		.filter(([name]) => !held.has(name))
		.map(([name, value]) => `${name} = ${print(value)}`)
	if (root.body?.kind !== 'vec') return lines.join('\n')
	const said = new Set<string>()
	const elements = root.body.elements.map(element => {
		if (element.kind !== 'sym' || !held.has(element.name) || said.has(element.name)) return print(element)
		said.add(element.name)
		return `${element.name} = ${print(root.bindings.find(([name]) => name === element.name)![1])}`
	})
	return [...lines, elements.length === 0 ? '[]' : `[\n${elements.map(line => `  ${line}`).join('\n')}\n]`].join('\n')
}

export type ProgramReading =
	| { readonly ast: LetAST }
	| { readonly message: string; readonly offset: number }

const OPENING = '{\n'
const BINDING = 'binding:'

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
	if (ast.kind !== 'let' || (ast.body !== null && ast.body.kind !== 'vec')) {
		return { message: 'This can only have bindings, and a vector of what to draw.', offset: 0 }
	}
	return { ast: new LetAST(ast.bindings, ast.body) }
}

/** A part of what is written, by where it starts and where it ends. */
export interface Written {
	readonly from: number
	readonly to: number
}

/**
 * Where what a slot holds is written, in a program read by `readProgram`. A binding is its name
 * as well. Null for what is not written, which it may only come to by default.
 */
function writtenOf({ key, ast }: Slot): Written | null {
	const { source } = ast
	if (source === undefined) return null
	const from = source.start - OPENING.length
	const to = source.end - OPENING.length
	if (!key.startsWith(BINDING)) return { from, to }
	const name = source.text.lastIndexOf(key.slice(BINDING.length), source.start)
	return { from: name < 0 ? from : name - OPENING.length, to }
}

/**
 * Where the row at `row` is written, in a program read by `readProgram`, or as near as there is
 * to it: a part that is not written is in what holds it. Null if it is not there at all.
 */
export function writtenAt(program: LetAST, env: Env, row: string): Written | null {
	let node: AST = program
	let at = env
	let written: Written | null = null
	for (const key of row.split('/')) {
		const slot: Slot | undefined = viewOf(node, at).slots.find(other => other.key === key)
		if (slot === undefined) return written
		written = writtenOf(slot) ?? written
		node = slot.ast
		at = slot.env
	}
	return written
}

/** The rows of the program that a selection goes over, being in none of them on its own. */
export function rowsAcross(program: LetAST, env: Env, from: number, to: number): readonly string[] {
	return viewOf(program, env).slots.flatMap(slot => {
		const written = writtenOf(slot)
		return written !== null && written.from < to && from < written.to ? [slot.key] : []
	})
}

/** The row of the least that has all of what is from `from` to `to` in it, or null if nothing does. */
export function rowWritten(program: LetAST, env: Env, from: number, to: number): string | null {
	const keys: string[] = []
	let node: AST = program
	let at = env
	for (;;) {
		const slot: Slot | undefined = viewOf(node, at).slots.find(other => {
			const written = writtenOf(other)
			return written !== null && written.from <= from && to <= written.to
		})
		if (slot === undefined) return keys.length > 0 ? keys.join('/') : null
		keys.push(slot.key)
		node = slot.ast
		at = slot.env
	}
}
