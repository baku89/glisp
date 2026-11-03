/**
 * Icons are metadata, on whatever a value's type is bound to:
 *
 *   ^{icon: "mdi:ruler"} number
 *
 * An icon is what Tweeq's `Icon` takes: an Iconify name such as `mdi:ruler`, or
 * `fill:` and the `d` of a path in a 24×24 box.
 *
 * `@glisp/lang` knows nothing about icons, so `withTypeIcons` adds a frame with
 * them over the prelude. It is an ordinary frame: a program can shadow any of it.
 */

import {
	type AST,
	type Env,
	infer,
	LetAST,
	LitAST,
	MetaAST,
	RecordAST,
	type TypeValue,
	unwrapLazy,
} from '@glisp/lang'

import { metadataOf, textOf, viewOf } from './structure'

const TYPE_ICONS: Readonly<Record<string, string>> = {
	number: 'mdi:numeric',
	string: 'mdi:format-quote-close',
	boolean: 'mdi:toggle-switch-outline',
	unit: 'mdi:code-parentheses',
	vector: 'mdi:code-brackets',
	enum: 'mdi:format-list-bulleted',
	IO: 'mdi:play-outline',
}

/** Shapes that have no name to hang metadata on. */
const SHAPE_ICONS: Readonly<Record<string, string>> = {
	function: 'mdi:function-variant',
	record: 'mdi:code-braces',
}

/** The bound name that stands for a type of each shape. */
const SHAPE_NAMES: Readonly<Record<string, string>> = {
	vector: 'vector',
	tuple: 'vector',
	enum: 'enum',
	io: 'IO',
}

/** `env`, with `icon` added to the metadata of the types it binds. */
export function withTypeIcons(env: Env): Env {
	const bindings = new Map()
	for (const [name, icon] of Object.entries(TYPE_ICONS)) {
		for (let frame = env; frame !== null; frame = frame.parent) {
			const binding = frame.bindings?.get(name)
			if (binding === undefined) continue
			const { ast } = binding
			bindings.set(name, {
				...binding,
				ast: new MetaAST(
					new RecordAST([
						...(ast.kind === 'meta' ? ast.metadata.fields : []),
						['icon', new LitAST(icon)],
					]),
					ast.kind === 'meta' ? ast.expr : ast
				),
			})
			break
		}
	}
	return { ast: new LetAST([], null), parent: env, bindings }
}

const iconBoundTo = (name: string, env: Env): string | null =>
	textOf(metadataOf(name, env)?.get('icon'))

/** The icon of a type, from the metadata on what it is bound to. */
export function iconOfType(type: TypeValue, env: Env): string | null {
	const resolved = unwrapLazy(type)
	const { shape } = resolved
	if (shape.kind === 'refine') return iconOfType(shape.base, env)
	if (shape.kind in SHAPE_ICONS) return SHAPE_ICONS[shape.kind] ?? null
	const name = SHAPE_NAMES[shape.kind] ?? resolved.typeName
	return iconBoundTo(name, env)
}

/**
 * The icon of a node: its own or its function's if it has one, or else that of
 * its type.
 */
export function iconOf(
	ast: AST,
	env: Env,
	expected: TypeValue | null = null
): string | null {
	const view = viewOf(ast, env, expected)
	if (view.icon !== null) return view.icon
	if (view.editor?.kind === 'enum') return iconBoundTo('enum', env)
	const type = infer(ast, env)
	return type === null ? null : iconOfType(type, env)
}
