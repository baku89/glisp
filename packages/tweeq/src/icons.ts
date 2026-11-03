/**
 * An icon belongs to a type, as metadata on what the type is bound to:
 *
 *   ^{icon: "mdi:ruler"} number
 *
 * A row shows the icon of its value's type, so a call shows that of what it
 * returns.
 *
 * An icon is what Tweeq's `Icon` takes: an Iconify name such as `mdi:ruler`, or
 * `fill:` and the `d` of a path in a 24×24 box.
 *
 * `@glisp/lang` knows nothing about icons, so `withIcons` adds a frame with
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
	toAst,
	type TypeValue,
	unwrapLazy,
} from '@glisp/lang'

import { metadataOf, type Slot, textOf, viewOf } from './structure'

/** Icons for what the prelude binds: its types, and its functions. */
const ICONS: Readonly<Record<string, string>> = {
	number: 'mdi:pound',
	string: 'mdi:format-quote-close',
	boolean: 'mdi:toggle-switch-outline',
	unit: 'mdi:code-parentheses',
	vector: 'mdi:code-brackets',
	enum: 'mdi:format-list-bulleted',
	IO: 'mdi:play-outline',

	'+': 'mdi:plus',
	'*': 'mdi:close',
	'-': 'mdi:minus',
	'/': 'mdi:slash-forward',
	'**': 'mdi:exponent',
	'++': 'mdi:link-variant',
	'<': 'mdi:less-than',
	'>': 'mdi:greater-than',
	'<=': 'mdi:less-than-or-equal',
	'>=': 'mdi:greater-than-or-equal',
	'==': 'mdi:equal',
	'!=': 'mdi:not-equal-variant',
	mod: 'mdi:percent-outline',
	sqrt: 'mdi:square-root',
	abs: 'mdi:code-brackets',
	floor: 'mdi:arrow-collapse-down',
	ceil: 'mdi:arrow-collapse-up',
	round: 'mdi:circle-outline',
	sin: 'mdi:sine-wave',
	cos: 'mdi:cosine-wave',
	tan: 'mdi:tangent',
	not: 'mdi:exclamation',
	and: 'mdi:set-center',
	or: 'mdi:set-all',
	first: 'mdi:page-first',
	last: 'mdi:page-last',
	count: 'mdi:counter',
	take: 'mdi:content-cut',
	drop: 'mdi:content-cut',
	map: 'mdi:arrow-right-bold-box-outline',
	filter: 'mdi:filter-outline',
	reduce: 'mdi:sigma',
	join: 'mdi:vector-union',
	split: 'mdi:call-split',
	range: 'mdi:format-list-numbered',
	reverse: 'mdi:swap-vertical',
	slice: 'mdi:content-cut',
	merge: 'mdi:call-merge',
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

/** `env`, with `icon` added to the metadata of the types and functions it binds. */
export function withIcons(env: Env): Env {
	const bindings = new Map()
	for (const [name, icon] of Object.entries(ICONS)) {
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

/**
 * The icon of a type: the one on the name it is bound to, or else that of the
 * type it refines, or of its shape.
 */
export function iconOfType(type: TypeValue, env: Env): string | null {
	const resolved = unwrapLazy(type)
	const named = toAst(resolved, env)
	const own = named.kind === 'sym' ? iconBoundTo(named.name, env) : null
	if (own !== null) return own
	const { shape } = resolved
	if (shape.kind === 'refine') return iconOfType(shape.base, env)
	if (shape.kind in SHAPE_ICONS) return SHAPE_ICONS[shape.kind] ?? null
	const name = SHAPE_NAMES[shape.kind] ?? resolved.typeName
	return iconBoundTo(name, env)
}

/** The icon of a node: its own if it has one, or else that of its type. */
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

/**
 * The icon of a sequence of arguments: of what its parameter holds, as `number` for
 * `...xs: number`, or else, for a generic one, of what is in it.
 */
export function iconOfSequence(slots: readonly Slot[]): string | null {
	const [first] = slots
	if (first === undefined) return null
	const declared =
		first.expected === null ? null : iconOfType(first.expected, first.env)
	return declared ?? iconOf(first.ast, first.env)
}
