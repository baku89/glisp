/**
 * What takes something, to be put around it: a function whose first parameters are what the
 * things are, in the order they are. To apply one is an edit to the program, and what was
 * there goes on being there, as what the function is given.
 */

import {
	type AST,
	CallAST,
	check,
	type Env,
	evaluate,
	freeRefs,
	isGlispClosure,
	isTypedHostFn,
	LetAST,
	makeType,
	makeTypedFn,
	MetaAST,
	parse,
	pushLetFrame,
	resolveTypeSlot,
	SymAST,
	toAst,
	type TypedHostFn,
	type TypeValue,
	VecAST,
	withOptional,
	withPathsInto,
} from '@glisp/lang'

import { reach, withParent } from './rowsClipboard'
import { defaultFor } from './structure'

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
			if (inner.kind !== 'host') continue
			const { value } = evaluate(inner, bound)
			add(name, value)
			const { members } = (value ?? {}) as Partial<TypeValue>
			for (const [member, of] of Object.entries(members ?? {})) add(`${name}.${member}`, of)
		}
	}
	return [...found.values()]
}

/** What says nothing of what it is, for what does not say. */
const anything: TypeValue = makeType('_', () => true, null)

/**
 * The functions that `root` says itself, as what they would be if a host gave them: taking
 * and giving what they say, for them to be gone about in the same way.
 */
export function functionsOfProgram(root: LetAST, env: Env): Filter[] {
	const frame = pushLetFrame(root, env)
	return [...(frame?.bindings ?? [])].flatMap(([name, { ast, env: bound }]): Filter[] => {
		const { value } = evaluate(ast, bound)
		if (!isGlispClosure(value)) return []
		const { params, returnType } = value.ast
		const typeOf = (type: AST): TypeValue => resolveTypeSlot(type, value.capturedEnv) ?? anything
		const plain = params.filter(({ variadic }) => !variadic)
		const tail = params.find(({ variadic }) => variadic)
		const fn = withOptional(
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
		return [{ name, label: name, fn, more: [] }]
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
	return new CallAST(parse(name), [...given, ...rest])
}

const errorsIn = (ast: AST, env: Env): number =>
	check(ast, env).filter(({ level }) => level === 'error').length

/** `root` with what is at `path` given to `filter`, in its place. Null if it is not there. */
export function wrappedAt(root: AST, env: Env, path: string, filter: Filter): AST | null {
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (!chain || !slot) return null
	const { ast } = slot
	const call = callOf(filter, [ast.kind === 'meta' ? ast.expr : ast], slot.env)
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

/**
 * `root` with the bindings `names` given to `filter`, each as `given`, in place of the last of
 * them and called what the first is, as `wrappedAt` leaves a name where it was. Null if one is not
 * there, if what is given refers to one, as it would then be referring to itself, or if that
 * leaves more wrong than there was: something else needed one that is gone, or what was given is
 * not what it takes. What it comes to goes through `around`, for what else a host has it be.
 */
export function combined(
	root: LetAST,
	env: Env,
	names: readonly string[],
	given: readonly AST[],
	filter: Filter,
	around: (call: AST) => AST = call => call,
): LetAST | null {
	const [as] = names
	const bound = new Set(root.bindings.map(([name]) => name))
	if (as === undefined || !names.every(name => bound.has(name))) return null
	const inside = given.map(ast => (ast.kind === 'meta' ? ast.expr : ast))
	if (inside.some(ast => names.some(name => freeRefs(ast).names.has(name)))) return null
	const call = around(callOf(filter, inside, env))
	const at = root.bindings.reduce((last, [name], i) => (names.includes(name) ? i : last), 0)
	const bindings = root.bindings.flatMap((binding, i): (readonly [string, AST])[] => {
		if (i === at) return [[as, call]]
		return names.includes(binding[0]) ? [] : [binding]
	})
	const ast = new LetAST(bindings, heldAs(root.body, names, as))
	return errorsIn(ast, env) > errorsIn(root, env) ? null : ast
}
