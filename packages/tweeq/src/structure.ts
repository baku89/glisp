/**
 * How an AST looks as a GUI: which widget a node gets, what its children are,
 * and how to produce the new node when something changes. No Vue in here.
 *
 * Editing is immutable. Replacing a child returns a new parent that shares
 * everything else, so `Runtime` reuses what did not change, and undo is a matter
 * of keeping the old root.
 */

import {
	type AST,
	CallAST,
	callParameters,
	check,
	type Diagnostic,
	enterNode,
	type Env,
	infer,
	LetAST,
	LitAST,
	MetaAST,
	parse,
	print,
	pushLetFrame,
	RecordAST,
	toAst,
	typeFits,
	type TypeValue,
	UNIT,
	unwrapLazy,
	VecAST,
} from '@glisp/lang'

/** The widget for a node that a widget can edit directly. */
export type Editor =
	| { readonly kind: 'number'; readonly value: number }
	| { readonly kind: 'string'; readonly value: string }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| {
			readonly kind: 'enum'
			readonly value: unknown
			readonly options: ReadonlyArray<unknown>
	  }
	| { readonly kind: 'unit' }

/** A position inside a node holding a child. */
export interface Slot {
	/** Stable among siblings, and what the slot is called on screen. */
	readonly key: string
	readonly label: string
	readonly ast: AST
	readonly env: Env
	/** What this position wants, if anything says. */
	readonly expected: TypeValue | null
	/** The new parent, with this slot holding `child`. */
	replace(child: AST): AST
	/** The new parent without this slot, if it can go. */
	remove?(): AST
	/** What to show while it is not being edited, in place of its value. */
	readonly display?: string
}

/** A parameter that a call could have, but does not. */
export interface MissingArgument {
	readonly name: string
	readonly expected: TypeValue | null
	/** The new call, with this argument given its type's default. */
	add(): AST
}

export interface NodeView {
	/** What the node is called on screen, such as a call's head. */
	readonly title: string | null
	/** What a call calls: its first row when open, above the arguments. */
	readonly head: Slot | null
	/** What `^{label}` calls this node, in place of its slot's name. */
	readonly label: string | null
	/** A name for Tweeq's `Icon`, from `^{icon}` on the node itself. */
	readonly icon: string | null
	/** Set if a widget can edit this node directly. */
	readonly editor: Editor | null
	readonly slots: ReadonlyArray<Slot>
	readonly missing: ReadonlyArray<MissingArgument>
	/** The new node with one more element, for a form that can grow. */
	readonly append: { readonly label: string; add(): AST } | null
}

const LEAF: NodeView = {
	title: null,
	head: null,
	label: null,
	icon: null,
	editor: null,
	slots: [],
	missing: [],
	append: null,
}

/** A function's name as a GUI shows it: `to-string` is `To String`. */
export function capitalCase(name: string): string {
	return name
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.split(/[-_]+/)
		.filter(word => word !== '')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
		.replace(/^$/, name)
}

export function textOf(ast: AST | undefined): string | null {
	return ast?.kind === 'lit' && typeof ast.value === 'string' ? ast.value : null
}

/** The metadata on what `name` is bound to, as seen from `env`. */
export function metadataOf(name: string, env: Env): MetaAST['metadata'] | null {
	for (let frame = env; frame !== null; frame = frame.parent) {
		const value =
			frame.bindings?.get(name)?.ast ??
			(frame.ast.kind === 'let'
				? frame.ast.bindings.find(([bound]) => bound === name)?.[1]
				: undefined)
		if (value !== undefined) {
			return value.kind === 'meta' ? value.metadata : null
		}
	}
	return null
}

/** How to show `ast`, which sits in `env` and is expected to be `expected`. */
export function viewOf(
	ast: AST,
	env: Env,
	expected: TypeValue | null = null
): NodeView {
	switch (ast.kind) {
		case 'lit':
			return { ...LEAF, editor: editorOf(ast, expected) }
		case 'call':
			return viewOfCall(ast, env)
		case 'vec':
			return viewOfVec(ast, env, expected)
		case 'record':
			return viewOfRecord(ast, env)
		case 'let':
			return viewOfLet(ast, env)
		case 'meta':
			return viewOfMeta(ast, env, expected)
		default:
			return LEAF
	}
}

/** The value a type accepts as its default, as source. */
export function defaultFor(type: TypeValue | null, env: Env): AST {
	if (type === null) return new LitAST(0)
	return toAst(unwrapLazy(type).default, env)
}

/** Source text for a node, for the fallback of editing it as code. */
export function sourceOf(ast: AST): string {
	return print(ast)
}

/** The node that `source` means, or null if it is not valid. */
export function parseSource(source: string): AST | null {
	try {
		return parse(source)
	} catch {
		return null
	}
}

function editorOf(ast: LitAST, expected: TypeValue | null): Editor | null {
	const value = ast.value
	const shape = expected === null ? null : unwrapLazy(expected).shape
	if (shape?.kind === 'enum') {
		return { kind: 'enum', value, options: [...shape.values] }
	}
	if (typeof value === 'number') return { kind: 'number', value }
	if (typeof value === 'string') return { kind: 'string', value }
	if (typeof value === 'boolean') return { kind: 'boolean', value }
	return value === UNIT ? { kind: 'unit' } : null
}

/** A call's arguments, each under the name its parameter has. */
function viewOfCall(ast: CallAST, env: Env): NodeView {
	const definition =
		ast.head.kind === 'sym' ? metadataOf(ast.head.name, env) : null
	const title =
		textOf(definition?.get('label')) ??
		(ast.head.kind === 'sym' ? capitalCase(ast.head.name) : print(ast.head))
	const inside = enterNode(ast, env)
	const hasSpread = ast.args.some(arg => arg.kind === 'spread')
	const parameters = hasSpread ? null : callParameters(ast, inside)
	const signature = parameterTypes(ast, inside)
	const withArg = (index: number, child: AST): CallAST => {
		const args = ast.args.slice()
		args[index] = child
		return new CallAST(ast.head, args, ast.kwargs)
	}

	const slots: Slot[] = []
	const missing: MissingArgument[] = []
	const positional = parameters?.names ?? []

	ast.args.forEach((arg, i) => {
		const isVariadic = i >= positional.length
		const name = positional[i]
		const label = isVariadic
			? `${parameters?.variadicName ?? ''}${parameters === null ? `${i}` : ` ${i - positional.length}`}`.trim()
			: name!
		slots.push({
			key: `arg${i}`,
			label,
			ast: arg,
			env: inside,
			expected: signature?.(i) ?? null,
			replace: child => withArg(i, child),
			...(isVariadic
				? {
						remove: () =>
							new CallAST(
								ast.head,
								ast.args.filter((_, j) => j !== i),
								ast.kwargs
							),
					}
				: {}),
		})
	})

	ast.kwargs?.forEach((arg, name) => {
		slots.push({
			key: `kw:${name}`,
			label: name,
			ast: arg,
			env: inside,
			expected: signature?.(positional.indexOf(name)) ?? null,
			replace: child =>
				new CallAST(ast.head, ast.args, new Map(ast.kwargs).set(name, child)),
			remove: () => {
				const kwargs = new Map(ast.kwargs)
				kwargs.delete(name)
				return new CallAST(ast.head, ast.args, kwargs.size > 0 ? kwargs : undefined)
			},
		})
	})

	positional.forEach((name, i) => {
		if (i < ast.args.length || ast.kwargs?.has(name)) return
		const expected = signature?.(i) ?? null
		missing.push({
			name,
			expected,
			add: () =>
				new CallAST(
					ast.head,
					ast.args,
					new Map(ast.kwargs ?? []).set(name, defaultFor(expected, inside))
				),
		})
	})

	const variadicName = parameters?.variadicName
	return {
		...LEAF,
		title,
		head: {
			key: 'head',
			label: 'Function',
			ast: ast.head,
			env: inside,
			expected: null,
			display: title,
			replace: child => new CallAST(child, ast.args, ast.kwargs),
		},
		slots,
		missing,
		append:
			variadicName === undefined
				? null
				: {
						label: variadicName,
						add: () =>
							new CallAST(
								ast.head,
								[...ast.args, defaultFor(signature?.(ast.args.length) ?? null, inside)],
								ast.kwargs
							),
					},
	}
}

/** The type of each argument position, where the head says. */
function parameterTypes(
	ast: CallAST,
	env: Env
): ((index: number) => TypeValue | null) | null {
	const head = infer(ast.head, env)
	if (head === null) return null
	const shape = unwrapLazy(head).shape
	if (shape.kind !== 'function') return null
	const concrete = (type: TypeValue | undefined): TypeValue | null =>
		type === undefined || type.shape.kind === 'var' ? null : type
	return index =>
		concrete(index < 0 ? undefined : (shape.paramTypes[index] ?? shape.variadicTail))
}

function viewOfVec(
	ast: VecAST,
	env: Env,
	expected: TypeValue | null
): NodeView {
	const inside = enterNode(ast, env)
	const shape = expected === null ? null : unwrapLazy(expected).shape
	const elementType = (i: number): TypeValue | null => {
		if (shape?.kind === 'vector') return shape.element
		if (shape?.kind === 'tuple') return shape.elements[i] ?? shape.rest ?? null
		return null
	}
	return {
		...LEAF,
		slots: ast.elements.map((element, i) => ({
			key: `${i}`,
			label: `${i}`,
			ast: element,
			env: inside,
			expected: elementType(i),
			replace: child => {
				const elements = ast.elements.slice()
				elements[i] = child
				return new VecAST(elements)
			},
			remove: () => new VecAST(ast.elements.filter((_, j) => j !== i)),
		})),
		append: {
			label: 'element',
			add: () =>
				new VecAST([
					...ast.elements,
					ast.elements.length > 0 && elementType(ast.elements.length) === null
						? ast.elements[ast.elements.length - 1]!
						: defaultFor(elementType(ast.elements.length), inside),
				]),
		},
	}
}

function viewOfRecord(ast: RecordAST, env: Env): NodeView {
	const inside = enterNode(ast, env)
	const slots: Slot[] = []
	ast.fields.forEach((entry, i) => {
		const isSpread = !Array.isArray(entry)
		const child = (isSpread ? (entry as { expr: AST }).expr : (entry as readonly [string, AST])[1])
		if (isSpread) return
		const name = (entry as readonly [string, AST])[0]
		slots.push({
			key: `field:${name}`,
			label: name,
			ast: child,
			env: inside,
			expected: null,
			replace: next => {
				const fields = ast.fields.slice()
				fields[i] = [name, next] as const
				return new RecordAST(fields, ast.optional)
			},
			remove: () =>
				new RecordAST(ast.fields.filter((_, j) => j !== i), ast.optional),
		})
	})
	return { ...LEAF, slots }
}

function viewOfLet(ast: LetAST, env: Env): NodeView {
	const inside = pushLetFrame(ast, env)
	const slots: Slot[] = ast.bindings.map(([name, value], i) => ({
		key: `binding:${name}`,
		label: name,
		ast: value,
		env: inside,
		expected: null,
		replace: child => {
			const bindings = ast.bindings.slice()
			bindings[i] = [name, child] as const
			return new LetAST(bindings, ast.body)
		},
		remove: () =>
			new LetAST(ast.bindings.filter((_, j) => j !== i), ast.body),
	}))
	if (ast.body !== null) {
		slots.push({
			key: 'body',
			label: '=',
			ast: ast.body,
			env: inside,
			expected: null,
			replace: child => new LetAST(ast.bindings, child),
		})
	}
	return { ...LEAF, slots }
}

/** Metadata is not shown as a slot of its own: the node inside takes its place. */
function viewOfMeta(
	ast: MetaAST,
	env: Env,
	expected: TypeValue | null
): NodeView {
	const inner = viewOf(ast.expr, env, expected)
	const wrap = (child: AST): AST => new MetaAST(ast.metadata, child)
	const label = textOf(ast.metadata.get('label'))
	return {
		...inner,
		label,
		title: label ?? inner.title,
		icon: textOf(ast.metadata.get('icon')) ?? inner.icon,
		head:
			inner.head === null
				? null
				: {
						...inner.head,
						replace: child => wrap(inner.head!.replace(child)),
					},
		slots: inner.slots.map(slot => ({
			...slot,
			replace: child => wrap(slot.replace(child)),
			...(slot.remove === undefined
				? {}
				: { remove: () => wrap(slot.remove!()) }),
		})),
		missing: inner.missing.map(m => ({ ...m, add: () => wrap(m.add()) })),
		append:
			inner.append === null
				? null
				: { label: inner.append.label, add: () => wrap(inner.append!.add()) },
	}
}

/**
 * Whether a node comes to something worth showing beside it. A let-block with no
 * trailing expression is only its bindings, and `%` only means something as part
 * of the expression around it.
 */
export function hasValue(ast: AST): boolean {
	const inner = ast.kind === 'meta' ? ast.expr : ast
	if (inner.kind === 'sym') return inner.name !== '%'
	return inner.kind !== 'let' || inner.body !== null
}

/**
 * Whether a node is worked out from something rather than written down: a
 * vector or record of literals is a value, and one that refers to anything is
 * not.
 */
export function isExpression(ast: AST): boolean {
	switch (ast.kind) {
		case 'lit':
			return false
		case 'meta':
			return isExpression(ast.expr)
		case 'vec':
			return ast.elements.some(isExpression)
		case 'record':
			return ast.fields.some(entry =>
				'kind' in entry ? true : isExpression(entry[1])
			)
		default:
			return true
	}
}

/**
 * What is wrong with a node, if anything: what evaluating it reports, what
 * checking it reports, which includes what never runs, or that it does not fit
 * where it is.
 */
export function problemOf(
	ast: AST,
	env: Env,
	expected: TypeValue | null,
	read: (ast: AST, env: Env) => { readonly diagnostics: readonly Diagnostic[] }
): string | null {
	if (!hasValue(ast)) return null
	const problem = [...read(ast, env).diagnostics, ...check(ast, env)].find(
		diagnostic => diagnostic.level === 'error'
	)
	if (problem !== undefined) return problem.message
	const type = expected === null ? null : infer(ast, env)
	return type !== null && expected !== null && !typeFits(type, expected)
		? `type mismatch: expected ${expected.typeName}, got ${type.typeName}`
		: null
}

/** Something that can be done to a slot, for a menu. */
export interface SlotAction {
	readonly label: string
	/** The new parent, after doing it. */
	apply(): AST
}

/**
 * What can be done to a slot: fill in the arguments it does not have yet, grow
 * it, or delete it.
 */
export function actionsOf(slot: Slot): SlotAction[] {
	const inner = viewOf(slot.ast, slot.env, slot.expected)
	const actions: SlotAction[] = inner.missing.map(missing => ({
		label: `Add ${missing.name}`,
		apply: () => slot.replace(missing.add()),
	}))
	if (inner.append !== null) {
		const append = inner.append
		actions.push({
			label: `Add ${append.label}`,
			apply: () => slot.replace(append.add()),
		})
	}
	if (slot.remove !== undefined) {
		const remove = slot.remove
		actions.push({ label: 'Delete', apply: remove })
	}
	return actions
}

/** Replace a literal, keeping metadata around it. */
export function withLiteral(ast: AST, value: number | string | boolean): AST {
	return ast.kind === 'meta'
		? new MetaAST(ast.metadata, new LitAST(value))
		: new LitAST(value)
}

/** The literal a node holds, seeing through metadata. */
export function literalOf(ast: AST): LitAST | null {
	const inner = ast.kind === 'meta' ? ast.expr : ast
	return inner.kind === 'lit' ? inner : null
}
