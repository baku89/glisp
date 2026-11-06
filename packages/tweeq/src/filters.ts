/**
 * What takes something, to be put around it: a function whose first parameters are what the
 * things are, in the order they are. To apply one is an edit to the program, and what was
 * there goes on being there, as what the function is given.
 */

import {
	type AST,
	callParameters,
	keySegment,
	CallAST,
	check,
	childrenOf,
	enterNode,
	type Env,
	evaluate,
	freeRefs,
	type GlispClosure,
	isGlispClosure,
	isTypedHostFn,
	LetAST,
	makeType,
	makeTypedFn,
	MetaAST,
	named,
	nameOf,
	parse,
	pushLetFrame,
	resolveTypeSlot,
	SymAST,
	toAst,
	type TypedHostFn,
	type TypeValue,
	unnamed,
	VecAST,
	withOptional,
	withoutMeta,
	withPathsInto,
	withPathsMoved,
} from '@glisp/lang'

import { reach, withParent } from './rowsClipboard'
import { defaultFor, layersVectorOf } from './structure'

/**
 * Say what the rest of what `fn` takes starts as, going by what it is given, where there is no
 * saying without it: a line to mirror across is near what is being mirrored.
 */
export function withInitial<F extends TypedHostFn>(
	fn: F,
	initial: (...given: never[]) => readonly unknown[]
): F {
	Object.defineProperty(fn, 'initial', { value: initial })
	return fn
}

const initialOf = (fn: TypedHostFn, given: readonly unknown[]): readonly unknown[] =>
	(fn as { initial?: (...given: readonly unknown[]) => readonly unknown[] }).initial?.(...given) ?? []

export interface Filter {
	/** As it is written, like `path.offset`. */
	readonly name: string
	readonly label: string
	readonly fn: TypedHostFn
	/** The parameters left that want another like what it was given, so that is to be asked for. */
	readonly more: readonly { readonly name: string; readonly type: TypeValue }[]
}

/** A type that knows nothing of what fits it says nothing about being for it. */
const saysSomething = (type: TypeValue): boolean =>
	type.typeName !== '_' && type.shape.kind !== 'var'

/** A record type takes any object, where only a plain one is a record of what it holds. */
const fitsPlainly = (type: TypeValue, value: unknown): boolean =>
	type.fits(value) &&
	(type.shape.kind !== 'record' || Object.getPrototypeOf(value) === Object.prototype)

/**
 * How many more of what `values` are it wants right after them, if it takes them at all. There
 * being no way to write it otherwise, one it wants further along has it not take them.
 */
function wanted(fn: TypedHostFn, values: readonly unknown[]): number | null {
	if (values.length === 0) return null
	const given = values.map((_, i) => fn.paramTypes[i] ?? fn.variadicTail)
	const fits = values.every((value, i) => {
		const type = given[i]
		return type !== undefined && saysSomething(type) && fitsPlainly(type, value)
	})
	if (!fits) return null
	const rest = fn.paramTypes.slice(values.length)
	const wants = rest.findIndex(type => !given.includes(type))
	const more = wants < 0 ? rest.length : wants
	return rest.slice(more).some(type => given.includes(type)) ? null : more
}

const titled = (name: string, fn: TypedHostFn): string =>
	(fn as { label?: string }).label ?? name.split('.').at(-1)!

/** What is bound in `env` that can be called, members of a type included, nearest first. */
export function functionsIn(env: Env): Filter[] {
	const found = new Map<string, Filter>()
	const add = (name: string, value: unknown): void => {
		if (!found.has(name) && isTypedHostFn(value)) {
			found.set(name, { name, label: titled(name, value), fn: value, more: [] })
		}
	}
	for (let frame = env; frame !== null; frame = frame.parent) {
		for (const [name, { ast, env: bound }] of frame.bindings ?? []) {
			const inner = ast.kind === 'meta' ? ast.expr : ast
			const { value } = evaluate(inner, bound)
			// What a prelude writes in Glisp is there as much as what is given to it.
			if (isGlispClosure(value) && !found.has(name)) {
				found.set(name, { name, label: name, fn: asHostFn(value), more: [] })
			}
			if (inner.kind !== 'host') continue
			add(name, value)
			const { members } = (value ?? {}) as Partial<TypeValue>
			for (const [member, of] of Object.entries(members ?? {})) add(`${name}.${member}`, of)
		}
	}
	return [...found.values()]
}

/** What says nothing of what it is, for what does not say. */
const anything: TypeValue = makeType('_', () => true, null)

/** A function written in Glisp, as what it would be if a host gave it: taking and giving what it says. */
function asHostFn({ ast: { params, returnType }, capturedEnv }: GlispClosure): TypedHostFn {
	const typeOf = (type: AST): TypeValue => resolveTypeSlot(type, capturedEnv) ?? anything
	const plain = params.filter(({ variadic }) => !variadic)
	const tail = params.find(({ variadic }) => variadic)
	return withOptional(
		makeTypedFn(
			plain.map(({ type }) => typeOf(type)),
			typeOf(returnType),
			() => undefined,
			plain.map(param => param.name),
			tail && typeOf(tail.type),
			tail?.name
		),
		plain.filter(({ optional }) => optional).map(param => param.name)
	)
}

/** The functions that `root` says itself, to be gone about as a host's are. */
export function functionsOfProgram(root: LetAST, env: Env): Filter[] {
	const frame = pushLetFrame(root, env)
	return [...(frame?.bindings ?? [])].flatMap(([name, { ast, env: bound }]): Filter[] => {
		const { value } = evaluate(ast, bound)
		return isGlispClosure(value) ? [{ name, label: name, fn: asHostFn(value), more: [] }] : []
	})
}

/** What takes `values`, one to a parameter from the first, of what `env` has and of `also`. */
export const filtersFor = (
	values: readonly unknown[],
	env: Env,
	also: readonly Filter[] = []
): Filter[] =>
	[...also, ...functionsIn(env).filter(({ name }) => !also.some(other => other.name === name))].flatMap(filter => {
		const { fn } = filter
		const more = wanted(fn, values)
		if (more === null) return []
		const from = values.length
		return [
			{
				...filter,
				more: fn.paramTypes.slice(from, from + more).map((type, i) => ({
					name: fn.paramNames?.[from + i] ?? `arg${from + i}`,
					type,
				})),
			},
		]
	})

const isWritten = (value: unknown): boolean =>
	typeof value === 'object' && value !== null && typeof (value as { print?: unknown }).print === 'function'

/**
 * What calls the function `name`: what it reads as, as `path.offset` does, or else the name itself,
 * which may need `\` to be written, as `my\ shape` does. Read in a call, as `/` alone is otherwise
 * the root of the program.
 */
function headNamed(name: string): AST {
	try {
		const call = parse(`(${name})`)
		if (call.kind === 'call' && call.args.length === 0 && call.kwargs === undefined) return call.head
	} catch {
		// Not written as a name, and so it is one with what it holds
	}
	return new SymAST(name)
}

/** A call of `filter` with `given`, the rest of what it needs being what it would be at first. */
export function callOf({ name, fn }: Filter, given: readonly AST[], env: Env): CallAST {
	const names = fn.paramNames ?? []
	// What it starts as goes by what it is given, so there is nothing to go by with nothing.
	const initial = given.length === 0 ? [] : initialOf(fn, given.map(ast => evaluate(ast, env).value))
	const rest = fn.paramTypes.slice(given.length).flatMap((type, i) => {
		const param = names[given.length + i]
		// What it starts as can be how it comes about, and not only what it comes to.
		if (i < initial.length) return [isWritten(initial[i]) ? (initial[i] as AST) : toAst(initial[i], env)]
		return param !== undefined && fn.optional?.has(param) ? [] : [defaultFor(type, env)]
	})
	return new CallAST(headNamed(name), [...given, ...rest])
}

const errorsIn = (ast: AST, env: Env): number =>
	check(ast, env).filter(({ level }) => level === 'error').length

/**
 * `root` with what is at `path` given to `filter`, in its place. Null if it is not there. What it
 * was called, or `as`, it goes on being called in there too, as what is combined is, so that it is
 * called that again once let go of.
 */
export function wrappedAt(root: AST, env: Env, path: string, filter: Filter, as?: string | null): AST | null {
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (!chain || !slot) return null
	const { ast } = slot
	const name = as ?? nameOf(ast)
	const inner = unnamed(ast.kind === 'meta' ? ast.expr : ast)
	const call = callOf(filter, [name === null ? inner : named(name, inner)], slot.env)
	const next = ast.kind === 'meta' ? new MetaAST(ast.metadata, call) : call
	return withPathsInto(withParent(chain, slot.replace(next)), env, call)
}

/** What a block's vector holds, with `as` where the frontmost of `names` was, and none of the rest. */
function heldAs(body: AST | null, names: readonly string[], as: string): AST | null {
	if (body?.kind !== 'vec') return body
	const isOne = (element: AST) => element.kind === 'sym' && names.includes(element.name)
	const first = body.elements.findIndex(isOne)
	return new VecAST(
		body.elements.flatMap((element, i) => (i === first ? [new SymAST(as)] : isOne(element) ? [] : [element]))
	)
}

type Levels = readonly (string | number)[]

/** What a path says to go from `holder` to `node`, being it or an argument of it, if it can. */
function levelsWithin(holder: AST, node: AST, frame: Env): Levels | null {
	const bare = withoutMeta(holder)
	if (bare === node) return []
	if (bare.kind !== 'call') return null
	const index = bare.args.findIndex(arg => withoutMeta(arg) === node)
	// What has a name of its own there is reached by it, wherever it goes in the call.
	const given = index === -1 ? null : nameOf(bare.args[index]!)
	if (given !== null) return [given]
	const parameters = index === -1 ? null : callParameters(bare, frame)
	if (parameters === null) return null
	const name = parameters.names[index]
	if (name !== undefined) return [keySegment(name)]
	return parameters.variadicName === undefined
		? null
		: [keySegment(parameters.variadicName), index - parameters.names.length]
}

/**
 * A name for what `filter` makes, from what it is called, as the shape a tool draws is called
 * what it is: none that is anywhere in `root` already, so that each says which it is.
 */
export function nameMadeBy(root: AST, filter: Filter): string {
	const stem = filter.name.slice(filter.name.lastIndexOf('.') + 1).replace(/[^a-zA-Z0-9]/g, '') || 'value'
	const taken = new Set<string>()
	const visit = (ast: AST): void => {
		const own = nameOf(ast)
		if (own !== null) taken.add(own)
		if (ast.kind === 'let') for (const [name] of ast.bindings) taken.add(name)
		for (const child of childrenOf(ast)) visit(child)
	}
	visit(root)
	let n = 1
	while (taken.has(`${stem}${n}`)) n++
	return `${stem}${n}`
}

/** `combined`, of what a block only binds: in place of the last of them, called what the first is. */
function combinedBindings(
	root: LetAST,
	env: Env,
	names: readonly string[],
	given: readonly AST[],
	filter: Filter,
	around: (call: AST) => AST,
	as: string | undefined
): LetAST | null {
	const bound = new Set(root.bindings.map(([name]) => name))
	if (as === undefined || !names.every(name => bound.has(name))) return null
	if (as !== names[0] && bound.has(as)) return null
	const inside = given.map(ast => (ast.kind === 'meta' ? ast.expr : ast))
	const refersOut = (ast: AST): boolean => {
		const refs = freeRefs(ast)
		return names.some(name => refs.names.has(name)) || refs.paths.some(({ up }) => up !== Infinity)
	}
	if (inside.some(refersOut)) return null
	// Each goes on being called what it was, in what it is given to now.
	const made = callOf(filter, inside.map((ast, i) => named(names[i]!, ast)), env)
	const call = around(made)
	const at = root.bindings.reduce((last, [name], i) => (names.includes(name) ? i : last), 0)
	const bindings = root.bindings.flatMap((binding, i): (readonly [string, AST])[] => {
		if (i === at) return [[as, call]]
		return names.includes(binding[0]) ? [] : [binding]
	})
	const placed = new LetAST(bindings, root.body)
	const before = pushLetFrame(root, env)
	const after = pushLetFrame(placed, env)
	const ast = names.reduce<AST>((moved, name, i) => {
		const value = root.bindings.find(([other]) => other === name)?.[1]
		const from = value && levelsWithin(value, inside[i]!, before)
		const into = levelsWithin(call, made, after)
		const to = levelsWithin(made, inside[i]!, after)
		return from && into && to ? withPathsMoved(moved, env, [name, ...from], [as, ...into, ...to]) : moved
	}, placed) as LetAST
	return errorsIn(ast, env) > errorsIn(root, env) ? null : ast
}

/**
 * `root` with the bindings `names` given to `filter`, each as `given` and still called what it
 * was, in place of the last of them and called `as`, or what the first is. A path from the
 * root to what is given goes on to it, there. Null if one is not there, if what is given refers
 * to one by name or climbs out of itself, as neither says the same from there, or if that leaves
 * more wrong than there was: something else needed one that is gone, or what was given is not
 * what it takes. What it comes to goes through `around`, for what else a host has it be.
 */
export function combined(
	root: LetAST,
	env: Env,
	names: readonly string[],
	given: readonly AST[],
	filter: Filter,
	around: (call: AST) => AST = call => call,
	as: string | undefined = names[0],
): LetAST | null {
	// What is drawn, by name: what the program's vector holds.
	const layered = layersVectorOf(root)
	const elements = layered?.vector.elements ?? []
	const drawn = new Map(elements.flatMap(element => (nameOf(element) === null ? [] : [[nameOf(element)!, element] as const])))
	if (as === undefined || (as !== names[0] && drawn.has(as))) return null
	if (layered === null || !names.every(name => drawn.has(name))) return combinedBindings(root, env, names, given, filter, around, as)
	const inside = given.map(ast => (ast.kind === 'meta' ? ast.expr : ast))
	const refersOut = (ast: AST): boolean => {
		const refs = freeRefs(ast)
		return names.some(name => refs.names.has(name)) || refs.paths.some(({ up }) => up !== Infinity)
	}
	if (inside.some(refersOut)) return null
	// Each goes on being called what it was, in what it is given to now.
	const made = callOf(filter, inside.map((ast, i) => named(names[i]!, ast)), env)
	const call = around(made)
	// Where the frontmost of them was, and none of the rest.
	const at = elements.findIndex(element => names.includes(nameOf(element) ?? ''))
	const held = elements.flatMap((element, i) =>
		i === at ? [named(as, call)] : names.includes(nameOf(element) ?? '') ? [] : [element]
	)
	const placed = layered.with(new VecAST(held))
	const prefix = layered.name === null ? [] : [layered.name]
	const before = enterNode(layered.vector, pushLetFrame(root, env))
	const after = enterNode(layersVectorOf(placed)!.vector, pushLetFrame(placed, env))
	const ast = names.reduce<AST>((moved, name, i) => {
		const value = unnamed(drawn.get(name)!)
		const from = levelsWithin(value, inside[i]!, before)
		const into = levelsWithin(call, made, after)
		const to = levelsWithin(made, inside[i]!, after)
		return from && into && to ? withPathsMoved(moved, env, [...prefix, name, ...from], [...prefix, as, ...into, ...to]) : moved
	}, placed) as LetAST
	return errorsIn(ast, env) > errorsIn(root, env) ? null : ast
}
