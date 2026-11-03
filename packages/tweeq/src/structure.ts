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
	evaluate,
	expand,
	infer,
	isTypeValue,
	LetAST,
	LitAST,
	MetaAST,
	parse,
	print,
	pushLetFrame,
	RecordAST,
	renameBinding,
	resolveTypeSlot,
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
	/** What its parameter's type says of a number, if anything. */
	readonly numberOptions?: NumberOptions
	/** Its place among the slots it can swap places with, if it has one. */
	readonly sort?: SlotSort
	/** What to show while it is not being edited, in place of its value. */
	readonly display?: string
}

/** What can be said of a number, for its widget, as InputNumber's props do. */
export interface NumberOptions {
	readonly min?: number
	readonly max?: number
	readonly step?: number
}

export interface SlotSort {
	readonly index: number
	readonly count: number
	/** The new parent, with the item at `from` moved to be at `to`. */
	move(from: number, to: number): AST
}

/** `items`, with the one at `from` moved to be at `to`. */
function moved<T>(items: readonly T[], from: number, to: number): T[] {
	const next = items.slice()
	const [item] = next.splice(from, 1)
	if (item !== undefined) next.splice(to, 0, item)
	return next
}

/**
 * What one item moving took `before` to `after`, as `[from, to]`, or null if
 * nothing moved.
 */
export function moveBetween<T>(
	before: readonly T[],
	after: readonly T[]
): [from: number, to: number] | null {
	const first = before.findIndex((item, i) => item !== after[i])
	if (first < 0) return null
	let last = before.length - 1
	while (before[last] === after[last]) last--
	return after[last] === before[first] ? [first, last] : [last, first]
}

const BINDING = 'binding:'

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
	/** What `min`, `max` and `step` in the node's metadata say of a number. */
	readonly numberOptions: NumberOptions
	/** A name for Tweeq's `Icon`, from `^{icon}` on the node itself. */
	readonly icon: string | null
	/** Set if a widget can edit this node directly. */
	readonly editor: Editor | null
	readonly slots: ReadonlyArray<Slot>
	readonly missing: ReadonlyArray<MissingArgument>
	/** The new node with one more element, for a form that can grow. */
	readonly append: {
		/** The key of the slot it adds, if that is known ahead. */
		readonly key?: string
		readonly label: string
		add(): AST
	} | null
}

const LEAF: NodeView = {
	title: null,
	head: null,
	label: null,
	numberOptions: {},
	icon: null,
	editor: null,
	slots: [],
	missing: [],
	append: null,
}

/** `min`, `max` and `step`, from metadata. A min and max out of order say nothing. */
function numberOptionsOf(metadata: MetaAST['metadata'] | null | undefined): NumberOptions {
	const read = (key: string): number | undefined => {
		const field = metadata?.get(key)
		return field?.kind === 'lit' && typeof field.value === 'number'
			? field.value
			: undefined
	}
	const [min, max, step] = [read('min'), read('max'), read('step')]
	const ordered = min === undefined || max === undefined || min < max
	return {
		...(ordered && min !== undefined ? { min } : {}),
		...(ordered && max !== undefined ? { max } : {}),
		...(step !== undefined && step > 0 ? { step } : {}),
	}
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

/**
 * What is said about the parameters of what a call calls. A parameter is called
 * what its type's metadata or the definition's `params` say, or else by its name.
 */
function parameterInfo(
	head: AST,
	env: Env
): { label(name: string): string; numberOptions(name: string): NumberOptions } {
	let definition: AST | null = head
	if (head.kind === 'sym') {
		definition = null
		for (let frame = env; frame !== null && definition === null; frame = frame.parent) {
			definition =
				frame.bindings?.get(head.name)?.ast ??
				(frame.ast.kind === 'let'
					? (frame.ast.bindings.find(([bound]) => bound === head.name)?.[1] ?? null)
					: null)
		}
	}
	const metadata = definition?.kind === 'meta' ? definition.metadata : null
	const params = metadata?.get('params')
	const fn = definition?.kind === 'meta' ? definition.expr : definition
	const metadataOfType = (name: string) => {
		const type = fn?.kind === 'fn' ? fn.params.find(p => p.name === name)?.type : null
		return type?.kind === 'meta' ? type.metadata : null
	}
	return {
		label(name) {
			const fromDefinition =
				params?.kind === 'record' ? textOf(params.get(name)) : null
			return textOf(metadataOfType(name)?.get('label')) ?? fromDefinition ?? name
		},
		numberOptions: name => numberOptionsOf(metadataOfType(name)),
	}
}

/**
 * Forms written like a call, with no function to call: `:`, `?` and `|>` are
 * syntax. Each says what to call what is in it.
 */
const FORMS: Readonly<Record<string, (index: number) => string>> = {
	':': index => (index === 0 ? 'Value' : 'Type'),
	'?': index =>
		index === 0
			? 'Value'
			: `${index % 2 === 1 ? 'Case' : 'Result'} ${Math.ceil(index / 2)}`,
	'|>': index => (index === 0 ? 'Input' : `Step ${index}`),
}

/** A form's parts, under what it calls them. Only the steps of a pipe can move. */
function viewOfForm(
	ast: CallAST,
	env: Env,
	labelOf: (index: number) => string
): NodeView {
	const inside = enterNode(ast, env)
	const name = ast.head.kind === 'sym' ? ast.head.name : ''
	const castTo = name === ':' && ast.args[1] !== undefined
		? resolveTypeSlot(ast.args[1], inside)
		: null
	const withArgs = (args: readonly AST[]): CallAST =>
		new CallAST(ast.head, [...args], ast.kwargs)
	return {
		...LEAF,
		slots: ast.args.map((arg, i) => ({
			key: `arg${i}`,
			label: labelOf(i),
			ast: arg,
			env: inside,
			expected: i === 0 ? castTo : null,
			replace: child => withArgs(ast.args.map((a, j) => (j === i ? child : a))),
			...(name === '|>' && i > 0
				? {
						remove: () => withArgs(ast.args.filter((_, j) => j !== i)),
						sort: {
							index: i - 1,
							count: ast.args.length - 1,
							move: (from: number, to: number) =>
								withArgs([ast.args[0]!, ...moved(ast.args.slice(1), from, to)]),
						},
					}
				: {}),
		})),
	}
}

/** A call's arguments, each under the name its parameter has. */
function viewOfCall(ast: CallAST, env: Env): NodeView {
	const form = ast.head.kind === 'sym' ? FORMS[ast.head.name] : undefined
	if (form !== undefined) return viewOfForm(ast, env, form)

	const definition =
		ast.head.kind === 'sym' ? metadataOf(ast.head.name, env) : null
	const title =
		textOf(definition?.get('label')) ??
		(ast.head.kind === 'sym' ? ast.head.name : print(ast.head))
	const inside = enterNode(ast, env)
	const hasSpread = ast.args.some(arg => arg.kind === 'spread')
	const parameters = hasSpread ? null : callParameters(ast, inside)
	const signature = parameterTypes(ast, inside)
	const withArg = (index: number, child: AST): CallAST => {
		const args = ast.args.slice()
		args[index] = child
		return new CallAST(ast.head, args, ast.kwargs)
	}

	const info = parameterInfo(ast.head, inside)
	const labelOf = info.label
	const slots: Slot[] = []
	const missing: MissingArgument[] = []
	const positional = parameters?.names ?? []

	ast.args.forEach((arg, i) => {
		const isVariadic = i >= positional.length
		const name = positional[i]
		const label = isVariadic
			? `${labelOf(parameters?.variadicName ?? '')}${parameters === null ? `${i}` : ` ${i - positional.length}`}`.trim()
			: labelOf(name!)
		const numberOptions = info.numberOptions(
			isVariadic ? (parameters?.variadicName ?? '') : name!
		)
		slots.push({
			key: `arg${i}`,
			label,
			ast: arg,
			env: inside,
			expected: signature?.(i) ?? null,
			numberOptions,
			replace: child => withArg(i, child),
			...(isVariadic
				? {
						remove: () =>
							new CallAST(
								ast.head,
								ast.args.filter((_, j) => j !== i),
								ast.kwargs
							),
						...(hasSpread
							? {}
							: {
									sort: {
										index: i - positional.length,
										count: ast.args.length - positional.length,
										move: (from, to) =>
											new CallAST(
												ast.head,
												[
													...ast.args.slice(0, positional.length),
													...moved(ast.args.slice(positional.length), from, to),
												],
												ast.kwargs
											),
									} satisfies SlotSort,
								}),
					}
				: {}),
		})
	})

	ast.kwargs?.forEach((arg, name) => {
		slots.push({
			key: `kw:${name}`,
			label: labelOf(name),
			numberOptions: info.numberOptions(name),
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
			name: labelOf(name),
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
						label: labelOf(variadicName),
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

/**
 * The default of what a vector holds: of what its slot says if it says, or else of
 * what its last element is, and never a copy, which an expression would make odd.
 */
function newElement(ast: VecAST, env: Env, expected: TypeValue | null): AST {
	if (expected !== null) return defaultFor(expected, env)
	const last = ast.elements.at(-1)
	const type = last === undefined ? null : infer(last, env)
	if (type === null) return new LitAST(0)
	const { kind } = unwrapLazy(type).shape
	// Nothing to go by, in a function or an unknown.
	return kind === 'function' || kind === 'var' || type.typeName === '_'
		? new LitAST(0)
		: defaultFor(type, env)
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
			sort: {
				index: i,
				count: ast.elements.length,
				move: (from, to) => new VecAST(moved(ast.elements, from, to)),
			},
		})),
		append: {
			label: 'Element',
			add: () =>
				new VecAST([...ast.elements, newElement(ast, inside, elementType(ast.elements.length))]),
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
	return {
		...LEAF,
		slots,
		append: {
			label: 'Binding',
			key: `${BINDING}${freshName(ast)}`,
			add: () =>
				new LetAST(
					[...ast.bindings, [freshName(ast), new LitAST(0)] as const],
					ast.body
				),
		},
	}
}

/** A name that a let does not have yet. */
function freshName(block: LetAST): string {
	const taken = new Set(block.bindings.map(([name]) => name))
	if (!taken.has('x')) return 'x'
	let n = 2
	while (taken.has(`x${n}`)) n++
	return `x${n}`
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
		numberOptions: numberOptionsOf(ast.metadata),
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
			...(slot.sort === undefined
				? {}
				: {
						sort: {
							...slot.sort,
							move: (from, to) => wrap(slot.sort!.move(from, to)),
						},
					}),
		})),
		missing: inner.missing.map(m => ({ ...m, add: () => wrap(m.add()) })),
		append:
			inner.append === null
				? null
				: { ...inner.append, add: () => wrap(inner.append!.add()) },
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

/** Whether a type has a type variable anywhere in it, such as `[...T]`. */
function mentionsTypeVar(type: TypeValue): boolean {
	const seen = new Set<unknown>()
	const visit = (part: unknown): boolean => {
		if (typeof part !== 'object' || part === null || seen.has(part)) return false
		seen.add(part)
		if (Array.isArray(part)) return part.some(visit)
		if (isTypeValue(part)) {
			const { shape } = unwrapLazy(part)
			return shape.kind === 'var' || visit(shape)
		}
		return Object.values(part).some(visit)
	}
	return visit(type)
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
	// A slot that is still generic says nothing until the call has been solved,
	// and the call reports what does not fit it.
	if (expected === null || mentionsTypeVar(expected)) return null
	const type = infer(ast, env)
	return type !== null && !typeFits(type, expected)
		? `type mismatch: expected ${expected.typeName}, got ${type.typeName}`
		: null
}

/** Edit what is at `path` of the slots down from `ast`, or null if nothing is. */
function editAt(
	ast: AST,
	env: Env,
	path: readonly string[],
	edit: (node: AST) => AST | null
): AST | null {
	const [key, ...rest] = path
	if (key === undefined) return edit(ast)
	const view = viewOf(ast, env)
	const slot = view.slots.find(s => s.key === key)
	if (slot === undefined) return null
	const child = editAt(slot.ast, slot.env, rest, edit)
	return child === null ? null : slot.replace(child)
}

/** Edit the bindings of a let, under any metadata; null if it is not a let. */
function editLet(
	node: AST,
	edit: (bindings: readonly (readonly [string, AST])[]) => (readonly [string, AST])[] | null
): AST | null {
	if (node.kind === 'meta') {
		const inner = editLet(node.expr, edit)
		return inner === null ? null : new MetaAST(node.metadata, inner)
	}
	if (node.kind !== 'let') return null
	const bindings = edit(node.bindings)
	return bindings === null ? null : new LetAST(bindings, node.body)
}

/**
 * `root`, with the binding at the path `source` moved to `position` of the one at
 * `target`, as a file moves in a tree: only from a let to a let, never into itself,
 * and not where the name is taken. Null if it cannot go there.
 *
 * Paths are slot keys from `root`, joined by `/`. What referred to the binding by
 * name may stop finding it, which then shows as an error, as any edit would.
 */
export function moveBinding(
	root: AST,
	env: Env,
	source: string,
	target: string,
	position: 'before' | 'after' | 'inside'
): AST | null {
	const split = (path: string) => path.split('/').filter(part => part !== '')
	const from = split(source)
	const to = split(target)
	const key = from.at(-1)
	if (key === undefined || !key.startsWith(BINDING)) return null
	const name = key.slice(BINDING.length)
	if (source === target || `${target}/`.startsWith(`${source}/`)) return null

	const anchorKey = to.at(-1)
	const intoPath = position === 'inside' ? to : to.slice(0, -1)
	if (position !== 'inside' && !anchorKey?.startsWith(BINDING)) return null
	const anchor = anchorKey?.slice(BINDING.length)
	const sameLet = intoPath.join('/') === from.slice(0, -1).join('/')

	let value: AST | undefined
	const removed = editAt(root, env, from.slice(0, -1), node =>
		editLet(node, bindings => {
			value = bindings.find(([bound]) => bound === name)?.[1]
			return value === undefined
				? null
				: bindings.filter(([bound]) => bound !== name)
		})
	)
	if (removed === null || value === undefined) return null
	const moving = value

	return editAt(removed, env, intoPath, node =>
		editLet(node, bindings => {
			if (!sameLet && bindings.some(([bound]) => bound === name)) return null
			const at =
				position === 'inside'
					? bindings.length
					: bindings.findIndex(([bound]) => bound === anchor) +
						(position === 'after' ? 1 : 0)
			if (position !== 'inside' && at < (position === 'after' ? 1 : 0)) return null
			const next = bindings.slice()
			next.splice(at, 0, [name, moving] as const)
			return next
		})
	)
}

/**
 * `root`, with the binding at `path` called `name`. See `renameBinding` in
 * `@glisp/lang`, which does the work, for what can and cannot be.
 */
export function renameBindingAt(
	root: AST,
	env: Env,
	path: string,
	name: string
): AST | null {
	const parts = path.split('/').filter(part => part !== '')
	const key = parts.at(-1)
	if (key === undefined || !key.startsWith(BINDING)) return null
	const from = key.slice(BINDING.length)
	const editIn = (node: AST): AST | null => {
		if (node.kind === 'meta') {
			const inner = editIn(node.expr)
			return inner === null ? null : new MetaAST(node.metadata, inner)
		}
		return node.kind === 'let' ? renameBinding(node, from, name) : null
	}
	return editAt(root, env, parts.slice(0, -1), editIn)
}

/**
 * Where the name at `path` is bound in `root`, as a path, or null if it is a sym
 * bound outside of it, such as in the prelude, or not a sym at all.
 */
export function referenceTargetOf(
	root: AST,
	env: Env,
	path: string
): string | null {
	const parts = path.split('/').filter(part => part !== '')
	const trail: { node: AST; prefix: string[] }[] = []
	let node = root
	let nodeEnv = env
	const prefix: string[] = []
	for (const key of parts) {
		trail.push({ node, prefix: [...prefix] })
		const slot = viewOf(node, nodeEnv).slots.find(s => s.key === key)
		if (slot === undefined) return null
		node = slot.ast
		nodeEnv = slot.env
		prefix.push(key)
	}
	const bare = node.kind === 'meta' ? node.expr : node
	if (bare.kind !== 'sym') return null
	for (const { node: ancestor, prefix: at } of trail.reverse()) {
		const block = ancestor.kind === 'meta' ? ancestor.expr : ancestor
		if (block.kind === 'let' && block.bindings.some(([name]) => name === bare.name)) {
			return [...at, `${BINDING}${bare.name}`].join('/')
		}
	}
	return null
}

/** The narrowest an input can be, side by side with others. */
const MIN_INPUT_WIDTH = 64

/**
 * Whether a sequence of `count` can sit side by side in `width`, `gap` apart. A
 * width of 0 is one not measured yet, which is taken to fit, so that nothing opens
 * only to close again.
 */
export function fitsInline(count: number, width: number, gap = 2): boolean {
	if (count === 0) return false
	return width === 0 || count * MIN_INPUT_WIDTH + (count - 1) * gap <= width
}

/** An icon for what kind of expression a node is, or null if it is not one. */
export function kindIconOf(ast: AST): string | null {
	if (!isExpression(ast)) return null
	switch (ast.kind) {
		case 'meta':
			return kindIconOf(ast.expr)
		case 'call':
			if (ast.head.kind === 'sym') {
				if (ast.head.name === ':') return 'mdi:tag-outline'
				if (ast.head.name === '?') return 'mdi:call-split'
				if (ast.head.name === '|>') return 'mdi:pipe'
			}
			return 'mdi:function-variant'
		case 'let':
			return 'mdi:graph-outline'
		case 'fn':
			return 'mdi:lambda'
		case 'sym':
		case 'path':
		case 'access':
			return 'mdi:arrow-top-right'
		case 'vec':
			return 'mdi:code-brackets'
		case 'record':
			return 'mdi:code-braces'
		default:
			return null
	}
}

/** Something that can be done to a slot, for a menu. */
export type SlotAction = {
	readonly label: string
	readonly icon: string
	/** Actions of a group go together, in a menu. */
	readonly group: 'edit' | 'copy' | 'remove'
} & (
	| {
			/** The new parent, after doing it. */
			apply(): AST
	  }
	| {
			/** What to put on the clipboard. */
			copy(): string
	  }
)

/**
 * What can be done to a slot. Nothing is worked out until an action is chosen,
 * so a menu costs nothing to offer.
 */
export function actionsOf(slot: Slot): SlotAction[] {
	const inner = viewOf(slot.ast, slot.env, slot.expected)
	const bare = slot.ast.kind === 'meta' ? slot.ast.expr : slot.ast
	const actions: SlotAction[] = []

	if (bare.kind === 'call') {
		actions.push({
			label: 'Evaluate One Step',
			icon: 'mdi:debug-step-into',
			group: 'edit',
			apply: () => {
				const next = expand(slot.ast, slot.env)
				if (next !== slot.ast) return slot.replace(next)
				// With no next rung, all that remains is the value, unless it failed.
				const { value, diagnostics } = evaluate(slot.ast, slot.env)
				return slot.replace(
					diagnostics.some(d => d.level === 'error')
						? slot.ast
						: toAst(value, slot.env)
				)
			},
		})
	}
	for (const missing of inner.missing) {
		actions.push({
			label: `Add ${missing.name}`,
			icon: 'mdi:plus',
			group: 'edit',
			apply: () => slot.replace(missing.add()),
		})
	}
	if (inner.append !== null) {
		const append = inner.append
		actions.push({
			label: `Add ${append.label}`,
			icon: 'mdi:plus',
			group: 'edit',
			apply: () => slot.replace(append.add()),
		})
	}

	if (isExpression(slot.ast) && hasValue(slot.ast) && slot.display === undefined) {
		actions.push({
			label: 'Copy Value',
			icon: 'mdi:content-copy',
			group: 'copy',
			copy: () => print(toAst(evaluate(slot.ast, slot.env).value, slot.env)),
		})
	}
	actions.push({
		label: isExpression(slot.ast) ? 'Copy Expression' : 'Copy Value',
		icon: isExpression(slot.ast) ? 'mdi:code-parentheses' : 'mdi:content-copy',
		group: 'copy',
		copy: () => sourceOf(slot.ast),
	})

	if (slot.remove !== undefined) {
		const remove = slot.remove
		actions.push({
			label: 'Delete',
			icon: 'mdi:trash-can-outline',
			group: 'remove',
			apply: remove,
		})
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
