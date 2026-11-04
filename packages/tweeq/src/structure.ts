/**
 * How an AST looks as a GUI: which widget a node gets, what its children are,
 * and how to produce the new node when something changes. No Vue in here.
 *
 * Editing is immutable. Replacing a child returns a new parent that shares
 * everything else, so `Runtime` reuses what did not change, and undo is a matter
 * of keeping the old root.
 */

import {
	isTypedHostFn,
	type AST,
	CallAST,
	callParameters,
	check,
	type Diagnostic,
	enterNode,
	type Env,
	evaluate,
	expand,
	hide,
	infer,
	lit,
	isHidden,
	isPinned,
	isTypeValue,
	LetAST,
	LitAST,
	lookupBareName,
	MetaAST,
	parse,
	PathAST,
	pathTarget,
	pin,
	print,
	pushLetFrame,
	RecordAST,
	renameBindingIn,
	SymAST,
	resolveTypeSlot,
	toAst,
	argFits,
	type TypeValue,
	UNIT,
	unhide,
	unpin,
	unwrapLazy,
	VecAST,
} from '@glisp/lang'

/** The widget for a node that a widget can edit directly. */
export type Editor =
	| { readonly kind: 'number'; readonly value: number }
	| { readonly kind: 'string'; readonly value: string }
	| { readonly kind: 'color'; readonly value: string }
	| {
			readonly kind: 'longText'
			readonly value: string
			/** What it is, which is all that shows of it until it is opened. */
			readonly label: string
			readonly icon?: string
	  }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| {
			readonly kind: 'enum'
			readonly value: unknown
			readonly options: ReadonlyArray<unknown>
			/** One for each of the options, if its type says. */
			readonly icons?: readonly string[]
	  }
	| { readonly kind: 'unit' }

/** A position inside a node holding a child. */
export interface Slot {
	/** Stable among siblings, and what the slot is called on screen. */
	readonly key: string
	readonly label: string
	/** The name of the parameter it is for, or of the field it is, if it goes by one. */
	readonly parameter?: string
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
	/** Whether `label` was written to be read, rather than being a parameter's name. */
	readonly labelled?: boolean
	/** What `^{doc}` on what it stands for says about it. */
	readonly doc?: string
	/** An icon of its own, rather than that of what it comes to. */
	readonly icon?: string
	/** What part it plays in what holds it, where that is more than being an argument. */
	readonly role?: SlotRole
	/** What has been worked out by the end of this part, for a pipe's steps. */
	readonly upTo?: AST
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
	readonly prefix?: string
	readonly suffix?: string
	readonly leftIcon?: string
}

/**
 * The parts that are not like the others: what a call calls, what a match looks at,
 * what it looks for and what it then comes to, and the steps of a pipe.
 */
export type SlotRole = 'function' | 'subject' | 'pattern' | 'result' | 'step'

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
	/** What the parameter is called in code, where `name` is what it is called on screen. */
	readonly parameter: string
	readonly expected: TypeValue | null
	/** The new call, with this argument given its type's default. */
	add(): AST
	/** The new call, with this argument being `child`. */
	give(child: AST): AST
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
		/** What it is for, where that is said. */
		readonly doc?: string
		readonly label: string
		add(): AST
		/** The new node with one more, before the one now at `at` of those that can grow. */
		insert(at: number): AST
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
	const prefix = textOf(metadata?.get('prefix'))
	const suffix = textOf(metadata?.get('suffix'))
	// Not `icon`, which is the type's own, for the row.
	const leftIcon = textOf(metadata?.get('fieldIcon'))
	const ordered = min === undefined || max === undefined || min < max
	return {
		...(ordered && min !== undefined ? { min } : {}),
		...(ordered && max !== undefined ? { max } : {}),
		...(step !== undefined && step > 0 ? { step } : {}),
		...(prefix === null ? {} : { prefix }),
		...(suffix === null ? {} : { suffix }),
		...(leftIcon === null ? {} : { leftIcon }),
	}
}

/** What the type wanted of an element of a vector says of a number at `index`, if anything. */
export function elementOptionsOf(expected: TypeValue | null, index: number): NumberOptions {
	const shape = expected === null ? null : unwrapLazy(expected).shape
	return shape?.kind === 'tuple'
		? numberOptionsOf(shape.elements[index]?.meta)
		: {}
}

/** Whether what `expected` is can also be taken hold of as a place, by a pad. */
export const isTranslatable = (expected: TypeValue | null): boolean =>
	textOf(expected?.meta?.get('input')) === 'translate'

/** Whether what `expected` is goes by a width and a height, which can be kept in ratio. */
export const isSizeInput = (expected: TypeValue | null): boolean =>
	textOf(expected?.meta?.get('input')) === 'size'

const PROPORTIONAL = 'proportional'

/** Whether the numbers of what `ast` comes to go together, by its own say or its type's. */
export function isProportional(ast: AST, env: Env): boolean {
	const said = infer(ast, env)?.meta?.get(PROPORTIONAL)
	return said?.kind === 'lit' && said.value === true
}

/**
 * `ast` with its numbers going together or not. It says so only if it has to: to stop
 * what it refers to from having them go together, and otherwise not at all.
 */
export function withProportional(ast: AST, env: Env, on: boolean): AST {
	const bare = ast.kind === 'meta' ? ast.expr : ast
	const fields =
		ast.kind === 'meta'
			? ast.metadata.fields.filter(f => 'kind' in f || f[0] !== PROPORTIONAL)
			: []
	const optional = ast.kind === 'meta' ? ast.metadata.optional : undefined
	const wrapped = (all: typeof fields): AST =>
		all.length === 0 ? bare : new MetaAST(new RecordAST(all, optional), bare)
	const without = wrapped(fields)
	return isProportional(without, env) === on
		? without
		: wrapped([...fields, [PROPORTIONAL, lit(on)]])
}

/** Which element of the vector at `parent` is at `path`, if one is. */
export function elementAt(parent: string, path: string): number | null {
	const rest = path.startsWith(`${parent}/`) ? path.slice(parent.length + 1) : ''
	return /^\d+$/.test(rest) ? Number(rest) : null
}

/** What the numbers of a vector were in ratio to, and what that last made of them. */
export interface KeptRatio {
	readonly basis: readonly number[]
	readonly wrote: readonly number[]
}

/**
 * The numbers of a vector with the one at `index` come to `value` and the others
 * following. They go by where they were before this began, for as long as nothing else
 * has changed them, so that going through 0 or rounding does not lose the ratio. What
 * is 0 says nothing of a ratio, so the others then stay as they are.
 */
export function keepingRatio(
	kept: KeptRatio | null,
	now: readonly number[],
	index: number,
	value: number
): KeptRatio {
	const same =
		kept !== null &&
		kept.wrote.length === now.length &&
		kept.wrote.every((number, i) => number === now[i])
	const basis = same ? kept.basis : now
	const from = basis[index] ?? 0
	const by = from === 0 ? 1 : value / from
	return { basis, wrote: basis.map((number, i) => (i === index ? value : number * by)) }
}

/**
 * What a slot's number field goes by: what its position wants, and over that what
 * its node says or its type has brought along.
 */
export function numberOptionsAt(slot: Slot): NumberOptions {
	return {
		...slot.numberOptions,
		...numberOptionsOf(infer(slot.ast, slot.env)?.meta),
	}
}

/**
 * What is typed in a number's field, as code in its place: it has to read, and to come to a
 * number without a problem. A `=` in front of it is only a way to begin.
 */
export function expressionForNumber(
	text: string,
	env: Env,
	read: (ast: AST, env: Env) => { value: unknown; diagnostics: readonly Diagnostic[] }
): { ast: AST } | { problem: string } {
	let ast: AST
	try {
		ast = parse(text.replace(/^\s*=/, ''))
	} catch (error) {
		return { problem: (error as Error).message }
	}
	const { value, diagnostics } = read(ast, env)
	const failed = diagnostics.find(({ level }) => level === 'error')
	if (failed !== undefined) return { problem: failed.message }
	return typeof value === 'number' && Number.isFinite(value)
		? { ast }
		: { problem: 'that does not come to a number' }
}

/** A name in code as words: `topLeft` as `Top Left`, and `control1` as `Control 1`. */
export function capitalCase(name: string): string {
	return name
		.replace(/([a-z\d])([A-Z])/g, '$1 $2')
		.replace(/([a-zA-Z])(\d)/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase())
}

/**
 * What a slot is to someone reading rather than writing: the label it was given, or else
 * its name as words. What is bound keeps its name, as that is what it is called.
 */
export const titleOf = (slot: Pick<Slot, 'key' | 'label' | 'labelled'>): string =>
	slot.labelled || slot.key.startsWith(BINDING) ? slot.label : capitalCase(slot.label)

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
			return { ...LEAF, editor: editorOfValue(ast.value, expected) }
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

/**
 * What an enum's values are shown as, each saying so with `^{icon: ...}`, in the order they
 * are in. `null` unless all of them do, since a row of icons with a gap in it says nothing.
 */
export function enumIconsOf(type: TypeValue | null): readonly string[] | null {
	const shape = type === null ? null : unwrapLazy(type).shape
	if (shape?.kind !== 'enum') return null
	const said = [...shape.values].map(value => textOf(shape.about?.get(value)?.get('icon')))
	return said.includes(null) ? null : (said as string[])
}

/** The widget for a value of what is `expected`, whether it is written so or comes to it. */
export function editorOfValue(value: unknown, expected: TypeValue | null): Editor | null {
	const shape = expected === null ? null : unwrapLazy(expected).shape
	if (shape?.kind === 'enum') {
		const icons = enumIconsOf(expected)
		return { kind: 'enum', value, options: [...shape.values], ...(icons ? { icons } : {}) }
	}
	if (typeof value === 'number') return { kind: 'number', value }
	// No color at all is not something a swatch can show: it would look like black.
	if (typeof value === 'string' && value !== 'none' && textOf(expected?.meta?.get('input')) === 'color') {
		return { kind: 'color', value }
	}
	// A type says so of what is expected to be too long to read in a row.
	if (typeof value === 'string' && textOf(expected?.meta?.get('input')) === 'long-text') {
		const icon = textOf(expected?.meta?.get('icon'))
		return {
			kind: 'longText',
			value,
			label: textOf(expected?.meta?.get('summary')) ?? 'Text',
			...(icon ? { icon } : {}),
		}
	}
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
): {
	label(name: string): string
	doc(name: string): string | null
	numberOptions(name: string): NumberOptions
} {
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
	const fromParams = (name: string): AST | undefined =>
		params?.kind === 'record' ? params.get(name) : undefined
	return {
		label(name) {
			const said = fromParams(name)
			const fromDefinition =
				said?.kind === 'record' ? textOf(said.get('label')) : textOf(said)
			return textOf(metadataOfType(name)?.get('label')) ?? fromDefinition ?? name
		},
		doc(name) {
			const said = fromParams(name)
			return (
				textOf(metadataOfType(name)?.get('doc')) ??
				(said?.kind === 'record' ? textOf(said.get('doc')) : null)
			)
		},
		numberOptions: name => numberOptionsOf(metadataOfType(name)),
	}
}

/** Forms written like a call, with no function to call: these are syntax. */
const FORMS: ReadonlySet<string> = new Set([':', '?', '|>'])

/** Whether a node is the `_` that a match takes as anything else. */
const isWildcard = (ast: AST | undefined): boolean =>
	ast?.kind === 'sym' && ast.name === '_'

/** `(? c true a _ b)`, which is how a match is an if. */
function isIfElse(args: readonly AST[]): boolean {
	const [, yes, , otherwise] = args
	return (
		args.length === 5 && yes?.kind === 'lit' && yes.value === true && isWildcard(otherwise)
	)
}

/** A form's parts, under what they are to it. */
function viewOfForm(ast: CallAST, env: Env, name: string): NodeView {
	const inside = enterNode(ast, env)
	const withArgs = (args: readonly AST[]): CallAST =>
		new CallAST(ast.head, [...args], ast.kwargs)
	const part = (i: number, label: string, rest: Partial<Slot> = {}): Slot => ({
		key: `arg${i}`,
		label,
		ast: ast.args[i]!,
		env: inside,
		expected: null,
		replace: child => withArgs(ast.args.map((a, j) => (j === i ? child : a))),
		...rest,
	})
	const has = (i: number) => i < ast.args.length

	if (name === ':') {
		const type = ast.args[1]
		return {
			...LEAF,
			slots: [
				...(has(0)
					? [
							part(0, 'Value', {
								expected: type === undefined ? null : resolveTypeSlot(type, inside),
							}),
						]
					: []),
				...(has(1) ? [part(1, 'Type')] : []),
			],
		}
	}

	if (name === '|>') {
		return {
			...LEAF,
			slots: ast.args.map((_, i) =>
				i === 0
					? part(0, 'Input', { role: 'subject' })
					: part(i, `Step ${i}`, {
							role: 'step',
							display: print(ast.args[i]!),
							upTo: withArgs(ast.args.slice(0, i + 1)),
							remove: () => withArgs(ast.args.filter((_, j) => j !== i)),
							sort: {
								index: i - 1,
								count: ast.args.length - 1,
								move: (from, to) =>
									withArgs([ast.args[0]!, ...moved(ast.args.slice(1), from, to)]),
							},
						})
			),
		}
	}

	// A match.
	if (isIfElse(ast.args)) {
		return {
			...LEAF,
			slots: [
				part(0, 'If', { role: 'subject' }),
				part(2, 'Then', { role: 'result' }),
				part(4, 'Else', { role: 'result' }),
			],
		}
	}
	const slots: Slot[] = has(0) ? [part(0, 'Value', { role: 'subject' })] : []
	let n = 0
	for (let i = 1; i < ast.args.length; i += 2) {
		n++
		if (isWildcard(ast.args[i]) && has(i + 1)) {
			slots.push(part(i + 1, 'Otherwise', { role: 'result' }))
			continue
		}
		slots.push(part(i, `Case ${n}`, { role: 'pattern' }))
		if (has(i + 1)) slots.push(part(i + 1, `Result ${n}`, { role: 'result' }))
	}
	return { ...LEAF, slots }
}

/**
 * A `doc` as a label would say it. A word in backticks stands for a parameter, or is
 * a bit of code: a parameter goes by its label, and code goes without the backticks.
 */
export function readableDoc(doc: string, labelOf: (name: string) => string): string {
	return doc.replace(/`([^`]+)`/g, (_, word: string) => labelOf(word))
}

/** A call's arguments, each under the name its parameter has. */
function viewOfCall(ast: CallAST, env: Env): NodeView {
	if (ast.head.kind === 'sym' && FORMS.has(ast.head.name)) {
		return viewOfForm(ast, env, ast.head.name)
	}

	const definition =
		ast.head.kind === 'sym' ? metadataOf(ast.head.name, env) : null
	const inside = enterNode(ast, env)
	const hasSpread = ast.args.some(arg => arg.kind === 'spread')
	const parameters = hasSpread ? null : callParameters(ast, inside)
	const signature = parameterTypes(ast, inside)
	const withArg = (index: number, child: AST): CallAST => {
		const args = ast.args.slice()
		args[index] = child
		return new CallAST(ast.head, args, ast.kwargs)
	}

	const positional = parameters?.names ?? []
	const info = parameterInfo(ast.head, inside)
	const labelOf = info.label
	const docOf = (name: string): { doc?: string } => {
		const doc = info.doc(name)
		return doc === null ? {} : { doc }
	}
	// A parameter's type may have got what it says from elsewhere, by its name.
	const numberOptionsOfParameter = (name: string): NumberOptions => ({
		...info.numberOptions(name),
		...numberOptionsOf(signature?.(positional.indexOf(name))?.meta),
	})
	const headValue = ast.head.kind === 'sym' ? null : evaluate(ast.head, inside).value
	const doc =
		textOf(definition?.get('doc')) ??
		(isTypedHostFn(headValue) ? ((headValue as { doc?: string }).doc ?? null) : null)
	const title =
		textOf(definition?.get('label')) ??
		(isTypedHostFn(headValue) ? (headValue as { label?: string }).label : undefined) ??
		(ast.head.kind === 'sym' ? ast.head.name : print(ast.head))
	const slots: Slot[] = []
	const missing: MissingArgument[] = []

	ast.args.forEach((arg, i) => {
		const isVariadic = i >= positional.length
		const name = positional[i]
		// With only these, a call's arguments go by their place, as `(* 1 2 3)` does.
		const label = !isVariadic
			? labelOf(name!)
			: positional.length === 0
				? `${i}`
				: `${labelOf(parameters?.variadicName ?? '')} ${i - positional.length}`
		const numberOptions = numberOptionsOfParameter(
			isVariadic ? (parameters?.variadicName ?? '') : name!
		)
		slots.push({
			key: `arg${i}`,
			label,
			...(isVariadic ? {} : { parameter: name! }),
			...(!isVariadic && labelOf(name!) !== name ? { labelled: true } : {}),
			ast: arg,
			env: inside,
			expected: signature?.(i) ?? null,
			numberOptions,
			...docOf(isVariadic ? (parameters?.variadicName ?? '') : name!),
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
			parameter: name,
			numberOptions: numberOptionsOfParameter(name),
			...docOf(name),
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
		const give = (child: AST): CallAST =>
			new CallAST(ast.head, ast.args, new Map(ast.kwargs ?? []).set(name, child))
		missing.push({
			name: labelOf(name),
			parameter: name,
			expected,
			add: () => give(defaultFor(expected, inside)),
			give,
		})
	})

	const variadicName = parameters?.variadicName
	return {
		...LEAF,
		title,
		head: {
			key: 'head',
			label: title,
			ast: ast.head,
			env: inside,
			expected: null,
			role: 'function',
			icon: textOf(definition?.get('icon')) ?? 'mdi:function-variant',
			...(doc === null ? {} : { doc: readableDoc(doc, labelOf) }),
			replace: child => new CallAST(child, ast.args, ast.kwargs),
		},
		slots,
		missing,
		append:
			variadicName === undefined
				? null
				: {
						label: labelOf(variadicName),
						...docOf(variadicName),
						add: () =>
							new CallAST(
								ast.head,
								[...ast.args, defaultFor(signature?.(ast.args.length) ?? null, inside)],
								ast.kwargs
							),
						insert: at => {
							const index = positional.length + at
							const args = ast.args.slice()
							args.splice(index, 0, defaultFor(signature?.(index) ?? null, inside))
							return new CallAST(ast.head, args, ast.kwargs)
						},
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
			label: textOf(elementType(i)?.meta?.get('title')) ?? `${i}`,
			ast: element,
			env: inside,
			expected: elementType(i),
			numberOptions: numberOptionsOf(elementType(i)?.meta),
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
			insert: at => {
				const elements = ast.elements.slice()
				elements.splice(at, 0, newElement(ast, inside, elementType(at)))
				return new VecAST(elements)
			},
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
			parameter: name,
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

/** What a block comes to, which it may have or not. */
const RETURN = 'Return'

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
			label: RETURN,
			ast: ast.body,
			env: inside,
			expected: null,
			replace: child => new LetAST(ast.bindings, child),
			remove: () => new LetAST(ast.bindings, null),
		})
	}
	return {
		...LEAF,
		slots,
		missing:
			ast.body === null
				? [
						{
							name: RETURN,
							parameter: RETURN,
							expected: null,
							add: () => new LetAST(ast.bindings, new LitAST(0)),
							give: child => new LetAST(ast.bindings, child),
						},
					]
				: [],
		append: {
			label: 'Binding',
			key: `${BINDING}${freshName(ast)}`,
			add: () =>
				new LetAST(
					[...ast.bindings, [freshName(ast), new LitAST(0)] as const],
					ast.body
				),
			insert: at => {
				const bindings = ast.bindings.slice()
				bindings.splice(at, 0, [freshName(ast), new LitAST(0)] as const)
				return new LetAST(bindings, ast.body)
			},
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
		missing: inner.missing.map(m => ({
			...m,
			add: () => wrap(m.add()),
			give: child => wrap(m.give(child)),
		})),
		append:
			inner.append === null
				? null
				: {
						...inner.append,
						add: () => wrap(inner.append!.add()),
						insert: at => wrap(inner.append!.insert(at)),
					},
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
export function mentionsTypeVar(type: TypeValue): boolean {
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
	return type !== null && !argFits(ast, type, expected)
		? `type mismatch: expected ${expected.typeName}, got ${type.typeName}`
		: null
}

/** Edit what is at `path` of the slots down from `ast`, or null if nothing is. */
function editAt(
	ast: AST,
	env: Env,
	path: readonly string[],
	edit: (node: AST, env: Env) => AST | null
): AST | null {
	const [key, ...rest] = path
	if (key === undefined) return edit(ast, env)
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
	let block: LetAST | null = null
	editAt(root, env, parts.slice(0, -1), node => {
		const bare = node.kind === 'meta' ? node.expr : node
		if (bare.kind === 'let') block = bare
		return node
	})
	return block === null ? null : renameBindingIn(root, block, from, name)
}

const bareOf = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

/** The row at `parts`, and the names and indices a path goes through to reach it. */
function levelsTo(
	root: AST,
	env: Env,
	parts: readonly string[]
): { slot: Slot; levels: (string | number)[] } | null {
	let node = root
	let nodeEnv = env
	let found: Slot | null = null
	const levels: (string | number)[] = []
	for (const key of parts) {
		const bare = bareOf(node)
		const slot = viewOf(node, nodeEnv).slots.find(s => s.key === key)
		if (slot === undefined) return null
		if (key.startsWith(BINDING)) levels.push(key.slice(BINDING.length))
		else if (key.startsWith('field:')) levels.push(key.slice('field:'.length))
		else if (key.startsWith('kw:')) levels.push(key.slice('kw:'.length))
		else if (/^\d+$/.test(key)) levels.push(Number(key))
		else if (key.startsWith('arg') && bare.kind === 'call') {
			const index = Number(key.slice('arg'.length))
			const parameters = callParameters(bare, slot.env)
			const name = parameters?.names[index]
			if (name !== undefined) levels.push(name)
			else if (parameters?.variadicName !== undefined) {
				levels.push(parameters.variadicName, index - parameters.names.length)
			} else return null
		} else return null
		found = slot
		node = slot.ast
		nodeEnv = slot.env
	}
	return found === null ? null : { slot: found, levels }
}

/**
 * `root`, with what is at the path `source` referring to what is at `target`: by
 * name if that name means it from there, or else by a path. Paths are slot keys
 * from `root`, joined by `/`. Null if it cannot be: what is at `target` holds it, or
 * no name or path reaches what is there.
 */
export function referenceAt(
	root: AST,
	env: Env,
	source: string,
	target: string
): AST | null {
	const split = (path: string) => path.split('/').filter(part => part !== '')
	const from = split(source)
	const to = split(target)
	if (from.length === 0 || to.length === 0) return null
	if (`${source}/`.startsWith(`${target}/`)) return null

	const walk = (parts: readonly string[]) => levelsTo(root, env, parts)
	const sourceAt = walk(from)
	const targetAt = walk(to)
	if (sourceAt === null || targetAt === null) return null
	const wanted = targetAt.slot.ast
	const here = sourceAt.slot.env

	const reference = (): AST | null => {
		const last = to.at(-1)!
		if (last.startsWith(BINDING)) {
			const name = last.slice(BINDING.length)
			if (lookupBareName(name, here)?.ast === wanted) return new SymAST(name)
		}
		let common = 0
		while (common < from.length - 1 && from[common] === to[common]) common++
		const shared = common === 0 ? [] : (walk(to.slice(0, common))?.levels ?? [])
		const segments = [
			...new Array<string>(from.length - 1 - common).fill('..'),
			...targetAt.levels.slice(shared.length),
		]
		const landed = pathTarget(segments, here)
		return 'message' in landed || bareOf(landed.ast) !== bareOf(wanted)
			? null
			: new PathAST(segments)
	}
	const next = reference()
	if (next === null) return null
	return editAt(root, env, from, node =>
		node.kind === 'meta' ? new MetaAST(node.metadata, next) : next
	)
}

const givenMissing = (
	root: AST,
	env: Env,
	at: string,
	parameter: string,
	give: (missing: MissingArgument) => AST
): AST | null =>
	editAt(root, env, at.split('/').filter(part => part !== ''), (node, nodeEnv) => {
		const missing = viewOf(node, nodeEnv).missing.find(m => m.parameter === parameter)
		return missing === undefined ? null : give(missing)
	})

/** `root`, with what the call at `at` is not yet given of `parameter` being `code`. */
export function missingWritten(
	root: AST,
	env: Env,
	at: string,
	parameter: string,
	code: AST
): AST | null {
	return givenMissing(root, env, at, parameter, missing => missing.give(code))
}

/** `root`, with what the call at `at` is not yet given of `parameter` referring to `target`. */
export function missingReferringTo(
	root: AST,
	env: Env,
	at: string,
	parameter: string,
	target: string
): AST | null {
	const given = givenMissing(root, env, at, parameter, missing => missing.add())
	return given && referenceAt(given, env, `${at}/kw:${parameter}`, target)
}

/**
 * What refers to the row at `path` from the top of `root`, written out, as there is no
 * path from nowhere in particular. Null if nothing can reach it.
 */
export function writtenReference(root: AST, env: Env, path: string): string | null {
	const levels = levelsTo(root, env, path.split('/').filter(part => part !== ''))?.levels
	if (levels === undefined) return null
	const [only] = levels
	return print(
		levels.length === 1 && typeof only === 'string' ? new SymAST(only) : new PathAST(levels)
	)
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

/**
 * What an expression starts with, when `=` is typed in a field as in a spreadsheet,
 * or null if it is not at the start of the field and is just a character. A field
 * with no text, such as a switch, starts empty.
 */
export function expressionFromField(
	field: {
		readonly value: string
		readonly selectionStart: number | null
		readonly selectionEnd: number | null
	} | null
): string | null {
	if (field === null || field.selectionStart === null) return ''
	if (field.selectionStart !== 0) return null
	return field.value.slice(field.selectionEnd ?? 0)
}

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value)

/**
 * Whether what a slot shows as `value` is a number, a boolean or a vector of numbers
 * to edit, which then changes what it comes from. Only what is worked out comes from
 * anything, and a vector written out already has its elements to edit.
 */
const isReference = (ast: AST): boolean => {
	const { kind } = bareOf(ast)
	return kind === 'sym' || kind === 'path'
}

export function canSolve(slot: Slot, value: unknown): boolean {
	return (
		(typeof value === 'boolean' ||
			isFiniteNumber(value) ||
			// Any other way of coming to a string is as good as code, and not undone by typing.
			(typeof value === 'string' && isReference(slot.ast)) ||
			(Array.isArray(value) &&
				value.length > 0 &&
				value.every(isFiniteNumber) &&
				(slot.ast.kind === 'meta' ? slot.ast.expr : slot.ast).kind !== 'vec')) &&
		isExpression(slot.ast) &&
		!isPinned(slot.ast) &&
		!isHidden(slot.ast) &&
		slot.display === undefined &&
		slot.role !== 'function'
	)
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

/** The least a number needs with no icon, for numbers to stay numbers as long as they can. */
const BARE_INPUT_WIDTH = 44

/** How `count` numbers go in a row: as they are, without their icons, or one above another. */
export type NumbersFit = 'side' | 'bare' | 'stacked'

/** What is left of a row for `count` numbers side by side says how they go. */
export function numbersFit(count: number, width: number, gap = 2): NumbersFit {
	if (fitsInline(count, width, gap)) return 'side'
	return count * BARE_INPUT_WIDTH + (count - 1) * gap <= width ? 'bare' : 'stacked'
}

/** The most numbers to put one above another, past which a row is more than it is worth. */
const MOST_STACKED = 4

/** Whether what a vector comes to can be numbers one above another, if it has to be. */
export const canStack = (value: unknown): boolean =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.length <= MOST_STACKED &&
	value.every(element => typeof element === 'number')

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

/**
 * What can be done to any slot it applies to, by name. A menu, a key and a host's own actions
 * all go by this, so that one of them is written once. `actionsOf` says when each applies.
 */
export const SLOT_COMMANDS = {
	step: { id: 'step', label: 'Evaluate One Step', icon: 'mdi:debug-step-into', keys: ['E'], group: 'edit' },
	all: { id: 'all', label: 'Evaluate All', icon: 'mdi:debug-step-over', keys: ['⇧', 'E'], group: 'edit' },
	pin: { id: 'pin', label: 'Pin', icon: 'mdi:pin', keys: ['P'], group: 'edit' },
	hide: { id: 'hide', label: 'Hide', icon: 'mdi:eye-off-outline', keys: ['H'], group: 'edit' },
	value: { id: 'value', label: 'Copy Value', icon: 'mdi:content-copy', group: 'copy' },
	copy: { id: 'copy', label: 'Copy Expression', icon: 'mdi:code-parentheses', keys: ['⌘', 'C'], group: 'copy' },
	delete: { id: 'delete', label: 'Delete', icon: 'mdi:trash-can-outline', keys: ['⌫'], group: 'remove' },
} as const

export type SlotCommand = keyof typeof SLOT_COMMANDS

/** A value as it is outside of a program: a string is its text, and not how it is written. */
export const plainTextOf = (value: unknown, env: Env): string =>
	typeof value === 'string' ? value : print(toAst(value, env))

/** Something that can be done to a slot, for a menu. */
export type SlotAction = {
	readonly label: string
	readonly icon: string
	/** Which one it is, if it is one of `SLOT_COMMANDS`. */
	readonly id?: SlotCommand
	/** The keys that run it, as a menu shows them. */
	readonly keys?: readonly string[]
	/** It adds to what is inside, which then ought to be showing. */
	readonly opens?: boolean
	/** Actions of a group go together, in a menu. */
	readonly group: 'edit' | 'copy' | 'remove'
} & (
	| {
			/** The new parent, after doing it. */
			apply(): AST
	  }
	| {
			/** What to put on the clipboard, for taking it somewhere else. */
			copy(): string
			/** What reads back as the same thing, if that is not the same, for pasting it here. */
			written?(): string
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

	const canStep =
		bare.kind === 'call' ||
		((bare.kind === 'sym' || bare.kind === 'path') &&
			hasValue(slot.ast) &&
			slot.role !== 'function')
	if (canStep) {
		actions.push({
			...SLOT_COMMANDS.step,
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
	if (isExpression(slot.ast) && hasValue(slot.ast) && slot.role !== 'function') {
		actions.push({
			...SLOT_COMMANDS.all,
			apply: () => {
				const { value, diagnostics } = evaluate(slot.ast, slot.env)
				return slot.replace(
					diagnostics.some(d => d.level === 'error') ||
						typeof value === 'function'
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
			opens: true,
			group: 'edit',
			apply: () => slot.replace(missing.add()),
		})
	}
	if (inner.append !== null) {
		const append = inner.append
		actions.push({
			label: `Add ${append.label}`,
			icon: 'mdi:plus',
			opens: true,
			group: 'edit',
			apply: () => slot.replace(append.add()),
		})
	}
	if (hasValue(slot.ast) && slot.role !== 'function' && slot.role !== 'step') {
		const pinned = isPinned(slot.ast)
		actions.push({
			...SLOT_COMMANDS.pin,
			...(pinned ? { label: 'Unpin', icon: 'mdi:pin-off' } : {}),
			apply: () => slot.replace(pinned ? unpin(slot.ast) : pin(slot.ast)),
		})
		const hidden = isHidden(slot.ast)
		actions.push({
			...SLOT_COMMANDS.hide,
			...(hidden ? { label: 'Show', icon: 'mdi:eye-outline' } : {}),
			apply: () => slot.replace(hidden ? unhide(slot.ast) : hide(slot.ast)),
		})
	}

	if (
		isExpression(slot.ast) &&
		hasValue(slot.ast) &&
		slot.display === undefined &&
		slot.role !== 'function'
	) {
		actions.push({
			...SLOT_COMMANDS.value,
			copy: () => plainTextOf(evaluate(slot.ast, slot.env).value, slot.env),
		})
	}
	actions.push({
		...SLOT_COMMANDS.copy,
		...(isExpression(slot.ast) ? {} : { label: 'Copy Value', icon: 'mdi:content-copy' }),
		copy: () => {
			const literal = isExpression(slot.ast) ? null : literalOf(slot.ast)
			return literal ? plainTextOf(literal.value, slot.env) : sourceOf(slot.ast)
		},
		written: () => sourceOf(slot.ast),
	})

	if (slot.remove !== undefined) {
		const remove = slot.remove
		actions.push({
			...SLOT_COMMANDS.delete,
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

/** What a row is, to head an inspector with. */
export interface Inspection {
	/** What it is called: its name, or the label of what it is an argument for. */
	readonly name: string
	/** The function it is a call of, if it is one. */
	readonly fn: string | null
	/** The row that holds it, if there is one. */
	readonly outer: string | null
}

export function inspectionOf(root: AST, env: Env, path: string): Inspection | null {
	const parts = path.split('/')
	let node = root
	let nodeEnv = env
	let own: Slot | undefined
	for (const key of parts) {
		const slots: readonly Slot[] = viewOf(node, nodeEnv).slots
		own = slots.find(s => s.key === key)
		if (own === undefined) return null
		node = own.ast
		nodeEnv = own.env
	}
	return {
		name: titleOf(own!),
		fn: viewOf(node, nodeEnv).head?.label ?? null,
		outer: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
	}
}
