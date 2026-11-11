/**
 * What an agent can ask of a program on the canvas, and do to it: as pure functions of the
 * program and its env, which the canvas answers for, through `mcpBridge` while it is open from
 * the dev server. Paths are slot keys from the root, joined by `/`, as rows are everywhere else.
 */

import {
	type AST,
	check,
	type Env,
	infer,
	LetAST,
	parse,
	print,
	printType,
	typeFits,
	type TypeValue,
} from '@glisp/lang'
import { functionsIn } from '@glisp/tweeq/filters'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { referenceAt, viewOf } from '@glisp/tweeq/structure'

import type { Vec } from './graphics'
import { withAdded } from './quickAdd'
import { sceneOf, withLayersFromOrder } from './scene'
import { svgOfProgram } from './svg'

/** What is short enough of code to show inline, and how much is too much. */
const SHORT = 120
const shortened = (code: string): string => (code.length > SHORT ? `${code.slice(0, SHORT - 1)}…` : code)

/** A type as it is called, if it is, or else as it is written without what is said about it. */
const typeName = (type: TypeValue | null | undefined): string | null => {
	if (!type) return null
	const said = type.meta?.get('name')
	return said?.kind === 'lit' && typeof said.value === 'string' ? said.value : printType(type.plain ?? type)
}

/** A slot under another, to go into by its path. */
export interface SlotInfo {
	readonly path: string
	readonly label: string
	/** What is written there, cut short. */
	readonly code: string
	/** What the slot wants, if it says. */
	readonly expected: string | null
	/** What what is there is, by inference, without working it out. */
	readonly inferred: string | null
}

const slotsOf = (node: AST, env: Env, path: string | null): SlotInfo[] =>
	viewOf(node, env).slots.map(slot => ({
		path: path === null ? slot.key : `${path}/${slot.key}`,
		label: slot.label,
		code: shortened(print(slot.ast)),
		expected: typeName(slot.expected),
		inferred: typeName(infer(slot.ast, slot.env)),
	}))

/** The program as code, with what it draws and what is at its top, by path. */
export function readProgram(root: LetAST, env: Env) {
	return {
		code: print(root),
		drawn: [...new Set(sceneOf(root, env).map(({ row }) => row))],
		slots: slotsOf(root, env, null),
	}
}

/** What is right under `path`: to go into what a program is, a level at a time. */
export function slotsAt(root: LetAST, env: Env, path: string): SlotInfo[] {
	const slot = reach(root, env, path)?.chain.at(-1)
	if (slot === undefined) throw new Error(`Nothing is at ${path}`)
	return slotsOf(slot.ast, slot.env, path)
}

/** What the slot at `path` wants, what is there is, and whether that will do. */
export function typeAt(root: LetAST, env: Env, path: string) {
	const slot = reach(root, env, path)?.chain.at(-1)
	if (slot === undefined) throw new Error(`Nothing is at ${path}`)
	const inferred = infer(slot.ast, slot.env)
	return {
		path,
		code: print(slot.ast),
		expected: typeName(slot.expected),
		inferred: typeName(inferred),
		fits: slot.expected === null || inferred === null ? null : typeFits(inferred, slot.expected),
	}
}

/** How `name` is called: what it takes, what it gives, and what it is for. */
export function signatureOf(env: Env, name: string) {
	const found = functionsIn(env).find(fn => fn.name === name)
	if (found === undefined) throw new Error(`There is no function called ${name}`)
	const { fn, label } = found
	const names = fn.paramNames ?? []
	const doc = (fn as { doc?: unknown }).doc
	return {
		name,
		label,
		doc: typeof doc === 'string' ? doc : null,
		params: fn.paramTypes.map((type, i) => ({
			name: names[i] ?? null,
			type: typeName(type)!,
			optional: names[i] !== undefined && (fn.optional?.has(names[i]!) ?? false),
		})),
		rest: fn.variadicTail === undefined ? null : { name: fn.variadicName ?? 'rest', type: typeName(fn.variadicTail)! },
		returns: typeName(fn.returnType)!,
		signature: fn.signature === undefined ? null : printType(fn.signature),
	}
}

/** What is at a path, as code in full, and what it is by inference: one of what is selected. */
export interface Picked {
	readonly path: string
	readonly code: string
	/** What the slot wants, if it says, as a point is wanted where a vertex is. */
	readonly expected: string | null
	readonly inferred: string | null
}

const pickedAt = (root: LetAST, env: Env, path: string): Picked[] => {
	const slot = reach(root, env, path)?.chain.at(-1)
	return slot === undefined
		? []
		: [{ path, code: print(slot.ast), expected: typeName(slot.expected), inferred: typeName(infer(slot.ast, slot.env)) }]
}

/**
 * What is selected, each with its code, in the order it was selected: and the parts of it that are
 * chosen within it, as points are with the tool that goes by them, which is what is done to next.
 */
export function selectionOf(root: LetAST, env: Env, selected: readonly string[], chosen: readonly string[]) {
	return {
		selected: selected.flatMap(path => pickedAt(root, env, path)),
		chosen: chosen.flatMap(path => pickedAt(root, env, path)),
	}
}

/** What is wrong with the program, as far as checking it says without running it. */
export const problemsOf = (root: LetAST, env: Env) =>
	check(root, env).map(({ level, message, source }) => ({ level, message, at: shortened(print(source.ast)) }))

/** The program, as `code` says it is: a block, or what it draws, as `[…]`. */
export function programOf(code: string, env: Env): LetAST {
	const ast = withLayersFromOrder(parse(code), env)
	if (!(ast instanceof LetAST)) throw new Error('A program is a block, as {…} or […]')
	return ast
}

/** The program with what is at `path` written as `code`. */
export function editedAt(root: LetAST, env: Env, path: string, code: string): LetAST {
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (!chain || !slot) throw new Error(`Nothing is at ${path}`)
	const next = withParent(chain, slot.replace(parse(code)))
	if (!(next instanceof LetAST)) throw new Error('That does not leave a program')
	return next
}

/** What the program draws, as SVG. */
export const renderedSvg = (root: LetAST, env: Env): string => svgOfProgram(root, env)

/**
 * The program with what is at `source` referring to what is at `target`, by name if it can or else
 * by a path: so that it goes on being that, as what it refers to changes.
 */
export function referredAt(root: LetAST, env: Env, source: string, target: string): LetAST {
	if (reach(root, env, source) === null) throw new Error(`Nothing is at ${source}`)
	if (reach(root, env, target) === null) throw new Error(`Nothing is at ${target}`)
	const next = referenceAt(root, env, source, target)
	if (!(next instanceof LetAST)) throw new Error(`${source} cannot refer to ${target}: it holds it, or nothing reaches it from there`)
	return next
}

/**
 * The program with `name` called on what is at `selected`, as quick-add does: each goes in the
 * argument of its type, and one more of what it gives is where the call goes, in place of what is
 * there. Otherwise it is a row of its own, around `at` if it is a shape.
 */
export function appliedTo(
	root: LetAST,
	env: Env,
	name: string,
	selected: readonly string[],
	at: Vec = [0, 0]
): { ast: LetAST; row: string; into: boolean } {
	for (const path of selected) if (reach(root, env, path) === null) throw new Error(`Nothing is at ${path}`)
	const added = withAdded(root, env, name, at, selected)
	if (added === null) throw new Error(`${name} cannot be added here, or with that selected`)
	return { ast: added.ast, row: added.row, into: added.into === true }
}
