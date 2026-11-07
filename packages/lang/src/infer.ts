/**
 * Static type inference: what an expression's type is, without running it.
 *
 * Spec: docs/spec/types.md — Type inference
 *
 * The only thing ever evaluated is a type expression, since types are values:
 * working out `(| "a" "b")` means calling `|`. A value expression is
 * never forced, however it is reached.
 *
 * Signatures are mandatory, so types flow locally rather than through a global
 * solver. A call solves its function's generics against its arguments, one by
 * one, by matching types structurally (`unify`). A function literal passed as
 * an argument is inferred against what is known by then, so the `x` in
 * `(map [1 2] (=> [x: _]: _ (+ x 1)))` is a number.
 *
 * `_` as a type of a value means "not known", so it is compatible with any
 * slot. A type that cannot be determined at all is `null`.
 */

import { desugar } from './desugar.js'
import {
	booleanType,
	type CallParameters,
	enterNode,
	evaluate,
	type GlispClosure,
	isGlispClosure,
	isOverload,
	isTypedHostFn,
	isTypeValue,
	lookupBareName,
	makeApplyType,
	makeFunctionType,
	makeLazyType,
	makeRecordType,
	makeTupleType,
	makeUnionType,
	derivedFrom,
	makeLiteralType,
	omittable,
	unitType as unitTypeValue,
	makeType,
	makeTypeVar,
	numberType,
	type OverloadValue,
	pathTarget,
	pushLetFrame,
	stringType,
	type TypedHostFn,
	argFits,
	typeFits,
	type TypeValue,
	unitType,
	unwrapLazy,
	withDefaultFrom,
	withTypeMeta,
} from './eval.js'
import {
	type AST,
	type BindingTarget,
	type CallAST,
	type Env,
	type FnAST,
	type Frame,
	LitAST,
	type RecordAST,
	SpreadAST,
	UNIT,
	type VecAST,
} from './types.js'

// -----------------------------------------------------------------------------
// Compatibility
// -----------------------------------------------------------------------------

/**
 * The least of `types` that the others fit, or null when no such type exists
 * among them. Used where several types meet: the clauses of `?`, the elements
 * of a vector, repeated uses of a generic.
 */
export function joinTypes(types: ReadonlyArray<TypeValue>): TypeValue | null {
	for (const candidate of types) {
		if (types.every(t => typeFits(t, candidate))) return candidate
	}
	return null
}

// -----------------------------------------------------------------------------
// Types of type expressions
// -----------------------------------------------------------------------------

type EnvMemo<T> = WeakMap<AST, WeakMap<object, { readonly value: T }>>
const ROOT_ENV_KEY = {}

function memoGet<T>(memo: EnvMemo<T>, ast: AST, env: Env): { readonly value: T } | undefined {
	return memo.get(ast)?.get(env ?? ROOT_ENV_KEY)
}

function memoSet<T>(memo: EnvMemo<T>, ast: AST, env: Env, value: T): void {
	let byEnv = memo.get(ast)
	if (byEnv === undefined) memo.set(ast, (byEnv = new WeakMap()))
	byEnv.set(env ?? ROOT_ENV_KEY, { value })
}

interface SlotInProgress {
	resolved: TypeValue | null
	lazy?: TypeValue
}

const typeSlotMemo: EnvMemo<TypeValue | null> = new WeakMap()
const typeSlotsInProgress = new Map<AST, Map<Env, SlotInProgress>>()

/**
 * Interpret `ast` as a type: the meaning of the right of `:`. Literal forms
 * mean what they look like, so `[...T]`, `[T U]`, `{x: T}` and
 * `(=> [T]: U)` are types here even though they evaluate to other things.
 * Anything else is evaluated, and has to produce a type. Returns null if it
 * does not. A binding that refers to itself, like
 * `Tree = {value: number children: [...Tree]}`, is a recursive type.
 */
export function resolveTypeSlot(ast: AST, env: Env): TypeValue | null {
	const known = memoGet(typeSlotMemo, ast, env)
	if (known !== undefined) return known.value
	const result = computeTypeSlot(ast, env)
	memoSet(typeSlotMemo, ast, env, result)
	return result
}

function computeTypeSlot(ast: AST, env: Env): TypeValue | null {
	switch (ast.kind) {
		// What is said of a type where one is wanted is said of it, and not of its values:
		// that is `(: T ...)`
		case 'meta':
			return resolveTypeSlot(ast.expr, env)
		case 'vec':
			return tupleSlot(ast, env)
		case 'record':
			return recordSlot(ast, env)
		case 'fn':
			return ast.body === null ? functionTypeOfLiteral(ast, env) : null
		case 'lit':
			return literalSlot(ast.value)
		case 'sym':
			return symbolSlot(ast.name, env) ?? typeFromEvaluating(ast, env)
		case 'call':
			if (ast.head.kind === 'sym' && ast.head.name === ':' && ast.args[0] !== undefined) {
				const base = resolveTypeSlot(ast.args[0], env)
				return base === null ? null : derivedFrom(base, ast, env).type
			}
			return applicationSlot(ast, env) ?? typeFromEvaluating(ast, env)
		default:
			return typeFromEvaluating(ast, env)
	}
}

/**
 * The type a parameter is declared to have, `(| T unit)` for one written `y?: T`, as
 * it can be left out. Null if its type does not come to one.
 */
export function paramTypeOf(
	param: { readonly type: AST; readonly optional?: boolean },
	env: Env
): TypeValue | null {
	const type = resolveTypeSlot(param.type, env)
	return type !== null && param.optional === true ? omittable(type) : type
}

function typeFromEvaluating(ast: AST, env: Env): TypeValue | null {
	const value = evaluate(ast, env).value
	return isTypeValue(value) ? value : null
}

/** A value written where a type is wanted is the type of just that value, and `()` is `unit`. */
function literalSlot(value: unknown): TypeValue | null {
	if (isTypeValue(value)) return value
	if (value === UNIT) return unitTypeValue
	return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
		? makeLiteralType(value)
		: null
}

function tupleSlot(ast: VecAST, env: Env): TypeValue | null {
	const elements: TypeValue[] = []
	let rest: TypeValue | undefined
	for (let i = 0; i < ast.elements.length; i++) {
		const element = ast.elements[i]!
		const isSpread = element.kind === 'spread'
		if (isSpread && i !== ast.elements.length - 1) return null
		const type = resolveTypeSlot(isSpread ? element.expr : element, env)
		if (type === null) return null
		if (isSpread) rest = type
		else elements.push(type)
	}
	return makeTupleType(elements, rest)
}

function recordSlot(ast: RecordAST, env: Env): TypeValue | null {
	const fields = new Map<string, TypeValue>()
	for (const entry of ast.fields) {
		if (entry instanceof SpreadAST) return null
		const type = resolveTypeSlot(entry[1], env)
		if (type === null) return null
		fields.set(entry[0], type)
	}
	return makeRecordType(fields, ast.optional ?? new Set())
}

/**
 * A name bound to a literal type form, by its source rather than its value,
 * since a recursive type has no value, and evaluating leaves metadata behind. An
 * alias leads to what it stands for.
 */
function symbolSlot(name: string, env: Env): TypeValue | null {
	const target = lookupBareName(name, env)
	if (target === null) return null
	const derives = target.ast.kind === 'call' && target.ast.head.kind === 'sym' && target.ast.head.name === ':'
	if (!derives && !['vec', 'record', 'meta', 'sym'].includes(target.ast.kind)) return null
	const reentered = typeSlotsInProgress.get(target.ast)?.get(target.env)
	if (reentered !== undefined) {
		reentered.lazy ??= makeLazyType(name, () => reentered.resolved)
		return reentered.lazy
	}
	const state: SlotInProgress = { resolved: null }
	let byEnv = typeSlotsInProgress.get(target.ast)
	if (byEnv === undefined) typeSlotsInProgress.set(target.ast, (byEnv = new Map()))
	byEnv.set(target.env, state)
	try {
		state.resolved = resolveTypeSlot(target.ast, target.env)
	} finally {
		byEnv.delete(target.env)
	}
	return state.resolved
}

/** `(IO T)`, `(vector T)`, and `(F T)` for a generic `F`. */
function applicationSlot(ast: CallAST, env: Env): TypeValue | null {
	if (ast.head.kind !== 'sym') return null
	const head = bareTypeOf(ast.head.name, env)
	if (head === null) return null
	const args = ast.args.map(arg => resolveTypeSlot(arg, env))
	if (args.includes(null)) return null
	const typeArgs = args as TypeValue[]
	if (head.shape.kind === 'var') return makeApplyType(head, typeArgs)
	if (head.apply === undefined) return null
	const result = head.apply(typeArgs)
	return 'error' in result ? null : result
}

function bareTypeOf(name: string, env: Env): TypeValue | null {
	const target = lookupBareName(name, env)
	if (target === null) return null
	const inner = target.ast.kind === 'meta' ? target.ast.expr : target.ast
	if (inner.kind !== 'host' && inner.kind !== 'lit') return null
	return isTypeValue(inner.value) ? inner.value : null
}

// -----------------------------------------------------------------------------
// Function signatures
// -----------------------------------------------------------------------------

let topType: TypeValue | undefined

/** Made on first use, since this module and `eval.ts` import each other. */
function top(): TypeValue {
	return (topType ??= makeType('_', () => true, UNIT))
}

/**
 * A frame binding each generic of `fn`, to its solution or else to a type
 * variable. The types in a signature are read in this frame.
 */
function genericsFrame(
	fn: FnAST,
	env: Env,
	types: (name: string) => TypeValue
): Frame {
	const bindings = new Map<string, BindingTarget>()
	const frame: Frame = { ast: fn, parent: env, bindings }
	for (const name of fn.generics) {
		bindings.set(name, { ast: new LitAST(types(name) as never), env: frame })
	}
	return frame
}

const signatureMemo: EnvMemo<TypeValue> = new WeakMap()

/** The type of a function literal, as its signature declares it. */
function functionTypeOfLiteral(fn: FnAST, env: Env): TypeValue {
	const known = memoGet(signatureMemo, fn, env)
	if (known !== undefined) return known.value
	const typeEnv =
		fn.generics.length === 0 ? env : genericsFrame(fn, env, makeTypeVar)
	const paramNames: string[] = []
	const paramTypes: TypeValue[] = []
	let variadicTail: TypeValue | undefined
	let variadicName: string | undefined
	for (const param of fn.params) {
		const type = paramTypeOf(param, typeEnv) ?? top()
		if (param.variadic) {
			variadicTail = type
			variadicName = param.name
		} else {
			paramNames.push(param.name)
			paramTypes.push(type)
		}
	}
	const declared = resolveTypeSlot(fn.returnType, typeEnv) ?? top()
	const options = {
		paramNames,
		generics: fn.generics,
		...(variadicTail !== undefined ? { variadicTail } : {}),
		...(variadicName !== undefined ? { variadicName } : {}),
	}
	const type = makeFunctionType(paramTypes, declared, options)
	memoSet(signatureMemo, fn, env, type)
	if (fn.body === null || declared.typeName !== '_') return type
	// With a parameter that says nothing, what it is given says what the body comes to
	if ([...paramTypes, ...(variadicTail === undefined ? [] : [variadicTail])].some(t => t.typeName === '_')) {
		return type
	}

	// A return that says nothing, as `_` or by not being written, is what the body comes to. While
	// the body is read, a call of the function in it comes to `_`, as the type above says.
	const returned = infer(fn.body, bodyFrame(fn, env))
	if (returned === null || returned.typeName === '_') return type
	const inferred = makeFunctionType(paramTypes, returned, options)
	memoSet(signatureMemo, fn, env, inferred)
	return inferred
}

function functionTypeOfHost(fn: TypedHostFn): TypeValue {
	if (fn.signature !== undefined) return fn.signature
	return makeFunctionType(fn.paramTypes, fn.returnType, {
		...(fn.paramNames !== undefined ? { paramNames: fn.paramNames } : {}),
		...(fn.variadicTail !== undefined ? { variadicTail: fn.variadicTail } : {}),
		...(fn.variadicName !== undefined ? { variadicName: fn.variadicName } : {}),
	})
}

function functionTypeOfClosure(closure: GlispClosure): TypeValue {
	return functionTypeOfLiteral(closure.ast, closure.capturedEnv)
}

function typeOfOverload(overload: OverloadValue): TypeValue {
	const names = overload.variants.map(variant =>
		(isTypedHostFn(variant)
			? functionTypeOfHost(variant)
			: functionTypeOfClosure(variant)
		).typeName
	)
	return makeType(`(overload ${names.join(' ')})`, v => typeof v === 'function', UNIT)
}

/** The type a host value carries, if it says. */
function typeOfHostValue(value: unknown): TypeValue | null {
	if (isTypeValue(value)) return value
	if (isTypedHostFn(value)) return functionTypeOfHost(value)
	if (isGlispClosure(value)) return functionTypeOfClosure(value)
	if (isOverload(value)) return typeOfOverload(value)
	return null
}

// -----------------------------------------------------------------------------
// Solving generics
// -----------------------------------------------------------------------------

export type Solution = Map<string, TypeValue>

type ConflictReporter = (name: string, earlier: TypeValue, here: TypeValue) => void

/**
 * Match `actual` against `pattern`, solving the type variables of `pattern`.
 * A variable seen twice takes whichever of the two types the other fits, and
 * reports a conflict if neither does.
 */
export function unify(
	pattern: TypeValue,
	actual: TypeValue,
	solution: Solution,
	onConflict: ConflictReporter = () => {}
): void {
	const p = pattern.shape
	const target = unwrapLazy(actual)
	const a = target.shape
	if (p.kind === 'var') {
		const earlier = solution.get(p.name)
		if (earlier === undefined || typeFits(earlier, actual)) {
			solution.set(p.name, actual)
		} else if (!typeFits(actual, earlier)) {
			onConflict(p.name, earlier, actual)
		}
		return
	}
	const recur = (x: TypeValue, y: TypeValue): void =>
		unify(x, y, solution, onConflict)
	switch (p.kind) {
		case 'apply': {
			const parts = constructorParts(target)
			if (parts === null) return
			recur(p.head, parts.constructor)
			p.args.forEach((arg, i) => {
				const part = parts.args[i]
				if (part !== undefined) recur(arg, part)
			})
			return
		}
		case 'io':
			if (a.kind === 'io') recur(p.payload, a.payload)
			return
		case 'vector':
			if (a.kind === 'vector') recur(p.element, a.element)
			else if (a.kind === 'tuple') recur(p.element, elementOfTuple(a))
			return
		case 'tuple':
			if (a.kind === 'tuple') {
				p.elements.forEach((element, i) => {
					const part = a.elements[i]
					if (part !== undefined) recur(element, part)
				})
				if (p.rest !== undefined) {
					for (const part of a.elements.slice(p.elements.length)) {
						recur(p.rest, part)
					}
					if (a.rest !== undefined) recur(p.rest, a.rest)
				}
			} else if (a.kind === 'vector') {
				for (const element of p.elements) recur(element, a.element)
				if (p.rest !== undefined) recur(p.rest, a.element)
			}
			return
		case 'record':
			if (a.kind === 'record') {
				for (const [key, field] of p.fields) {
					const part = a.fields.get(key)
					if (part !== undefined) recur(field, part)
				}
			}
			return
		case 'function':
			if (a.kind === 'function') {
				p.paramTypes.forEach((param, i) => {
					const part = a.paramTypes[i] ?? a.variadicTail
					if (part !== undefined) recur(param, part)
				})
				recur(p.returnType, a.returnType)
			}
			return
		default:
			return
	}
}

/** `(IO T)` as a constructor and `[T]`, so that `(F T)` can match it. */
function constructorParts(
	type: TypeValue
): { constructor: TypeValue; args: ReadonlyArray<TypeValue> } | null {
	const shape = type.shape
	if (shape.kind === 'io') return { constructor: type, args: [shape.payload] }
	if (shape.kind === 'vector') return { constructor: type, args: [shape.element] }
	if (shape.kind === 'tuple') {
		const element = elementOfTuple(shape)
		return { constructor: makeTupleType([], element), args: [element] }
	}
	return null
}

/**
 * What a tuple's elements have in common. Unions are not inferred, so
 * `[1 "a"]` as a vector is a vector of anything rather than an error.
 */
function elementOfTuple(shape: {
	readonly elements: ReadonlyArray<TypeValue>
	readonly rest?: TypeValue
}): TypeValue {
	const all =
		shape.rest === undefined ? shape.elements : [...shape.elements, shape.rest]
	return joinTypes(all) ?? top()
}

/**
 * Replace type variables by their solutions. An unsolved variable stays as it
 * is under `'keep'`, and becomes `_` under `'top'`. A type with no variables
 * in it comes back identical.
 */
export function substitute(
	type: TypeValue,
	solution: ReadonlyMap<string, TypeValue>,
	unsolved: 'keep' | 'top' = 'top'
): TypeValue {
	const s = type.shape
	const sub = (t: TypeValue): TypeValue => substitute(t, solution, unsolved)
	switch (s.kind) {
		case 'var':
			return solution.get(s.name) ?? (unsolved === 'top' ? top() : type)
		case 'apply': {
			const head = sub(s.head)
			const args = s.args.map(sub)
			if (head.apply !== undefined) {
				const result = head.apply(args)
				return 'error' in result ? top() : result
			}
			return head.shape.kind === 'var' ? makeApplyType(head, args) : top()
		}
		case 'io': {
			const payload = sub(s.payload)
			if (payload === s.payload) return type
			const result = type.apply?.([payload])
			return result === undefined || 'error' in result ? top() : result
		}
		case 'vector': {
			const element = sub(s.element)
			return element === s.element ? type : makeTupleType([], element)
		}
		case 'tuple': {
			const elements = s.elements.map(sub)
			const rest = s.rest === undefined ? undefined : sub(s.rest)
			const same =
				elements.every((t, i) => t === s.elements[i]) && rest === s.rest
			return same ? type : makeTupleType(elements, rest)
		}
		case 'union': {
			const members = s.members.map(sub)
			return members.every((t, i) => t === s.members[i]) ? type : makeUnionType(members)
		}
		case 'record': {
			const fields = new Map([...s.fields].map(([k, t]) => [k, sub(t)]))
			const same = [...fields].every(([k, t]) => t === s.fields.get(k))
			return same ? type : makeRecordType(fields, s.optional)
		}
		case 'function': {
			const paramTypes = s.paramTypes.map(sub)
			const returnType = sub(s.returnType)
			const variadicTail =
				s.variadicTail === undefined ? undefined : sub(s.variadicTail)
			const same =
				paramTypes.every((t, i) => t === s.paramTypes[i]) &&
				returnType === s.returnType &&
				variadicTail === s.variadicTail
			if (same) return type
			return makeFunctionType(paramTypes, returnType, {
				...(s.paramNames !== undefined ? { paramNames: s.paramNames } : {}),
				...(variadicTail !== undefined ? { variadicTail } : {}),
			})
		}
		default:
			return type
	}
}

/**
 * A closure's generics at a call: a frame with each generic solved from the
 * arguments' types. Runs nothing. A generic that stays unsolved is `_`.
 */
export function solveClosureGenerics(
	fn: FnAST,
	captured: Env,
	args: ReadonlyArray<AST>,
	kwargs: ReadonlyMap<string, AST> | undefined,
	callerEnv: Env,
	onConflict: (name: string, earlier: TypeValue, here: TypeValue, arg: AST) => void
): Frame {
	const signature = functionTypeOfLiteral(fn, captured).shape
	const solution: Solution = new Map()
	if (signature.kind === 'function') {
		const names = signature.paramNames ?? []
		const unifyArg = (param: TypeValue, arg: AST): void => {
			const type = infer(arg, callerEnv)
			if (type === null) return
			unify(param, type, solution, (name, earlier, here) =>
				onConflict(name, earlier, here, arg)
			)
		}
		args.forEach((arg, i) => {
			const param = signature.paramTypes[i] ?? signature.variadicTail
			if (param !== undefined) unifyArg(param, arg)
		})
		kwargs?.forEach((arg, name) => {
			const index = names.indexOf(name)
			if (index >= 0) unifyArg(signature.paramTypes[index]!, arg)
		})
	}
	return genericsFrame(fn, captured, name => solution.get(name) ?? top())
}

// -----------------------------------------------------------------------------
// Inference
// -----------------------------------------------------------------------------

/** Called for what a static check finds wrong with a call. */
export type CallReporter = (ast: AST, message: string) => void

const inferMemo: EnvMemo<TypeValue | null> = new WeakMap()
const inProgress = new Map<AST, Set<Env>>()

/**
 * The type of `ast` in `env`, or `null` if it cannot be determined. Never runs
 * a value expression.
 */
export function infer(ast: AST, env: Env): TypeValue | null {
	const node = desugar(ast)
	const known = memoGet(inferMemo, node, env)
	if (known !== undefined) return known.value
	let envs = inProgress.get(node)
	if (envs?.has(env)) return null
	if (envs === undefined) inProgress.set(node, (envs = new Set()))
	envs.add(env)
	try {
		const result = inferNode(node, env)
		memoSet(inferMemo, node, env, result)
		return result
	} finally {
		envs.delete(env)
		if (envs.size === 0) inProgress.delete(node)
	}
}

function inferNode(ast: AST, env: Env): TypeValue | null {
	switch (ast.kind) {
		case 'lit': {
			const value = ast.value
			if (typeof value === 'number') return numberType
			if (typeof value === 'string') return stringType
			if (typeof value === 'boolean') return booleanType
			if (value === UNIT) return unitType
			return typeOfHostValue(value)
		}
		case 'host':
			return typeOfHostValue(ast.value)
		case 'sym': {
			const target = lookupBareName(ast.name, env)
			if (target === null) return null
			if (isTypeValue(target.type)) return target.type
			return infer(target.ast, target.env)
		}
		case 'path': {
			const target = pathTarget(ast.segments, env)
			return 'message' in target ? null : infer(target.ast, target.env)
		}
		case 'fn':
			return functionTypeOfLiteral(ast, env)
		case 'vec':
			return inferVec(ast, enterNode(ast, env))
		case 'record':
			return inferRecord(ast, enterNode(ast, env))
		case 'let':
			return ast.body === null
				? unitType
				: infer(ast.body, pushLetFrame(ast, env))
		case 'meta': {
			const type = infer(ast.expr, env)
			return type === null ? null : withTypeMeta(type, ast.metadata)
		}
		case 'unquote':
			return infer(ast.expr, env)
		case 'access': {
			const held = heldByHost(ast, env)
			return held === undefined
				? memberType(infer(ast.target, env), ast.key)
				: typeOfHostValue(held)
		}
		case 'call':
			return checkCall(ast, env, () => {})
		case 'spread':
			return null
	}
}

/** A vector literal is a tuple, which keeps its length. */
function inferVec(ast: VecAST, env: Env): TypeValue | null {
	const elements: TypeValue[] = []
	for (const element of ast.elements) {
		if (element.kind === 'spread') return null
		const type = infer(element, env)
		if (type === null) return null
		elements.push(type)
	}
	return makeTupleType(elements)
}

function inferRecord(ast: RecordAST, env: Env): TypeValue | null {
	const fields = new Map<string, TypeValue>()
	for (const entry of ast.fields) {
		if (entry instanceof SpreadAST) return null
		const type = infer(entry[1], env)
		if (type === null) return null
		fields.set(entry[0], type)
	}
	return makeRecordType(fields, ast.optional ?? new Set())
}

/**
 * What a name, or a member of what a host has bound, comes to, without running
 * anything, as `vec2.add` or `geom.rect.center`. Undefined if it is not that.
 */
function heldByHost(ast: AST, env: Env): unknown {
	if (ast.kind === 'sym') {
		const target = lookupBareName(ast.name, env)
		if (target === null) return undefined
		const inner = target.ast.kind === 'meta' ? target.ast.expr : target.ast
		return inner.kind === 'host' ? inner.value : undefined
	}
	if (ast.kind !== 'access' || typeof ast.key !== 'string') return undefined
	const holder = heldByHost(ast.target, env)
	if (isTypeValue(holder)) return holder.members?.[ast.key]
	return typeof holder === 'object' && holder !== null && !Array.isArray(holder)
		? (holder as Record<string, unknown>)[ast.key]
		: undefined
}

function memberType(
	container: TypeValue | null,
	key: string | number
): TypeValue | null {
	if (container === null) return null
	const shape = unwrapLazy(container).shape
	if (typeof key === 'number') {
		if (shape.kind === 'vector') return shape.element
		if (shape.kind === 'tuple') return shape.elements[key] ?? shape.rest ?? null
		return null
	}
	return shape.kind === 'record' ? (shape.fields.get(key) ?? null) : null
}

/**
 * The type of a call, reporting anything wrong with it along the way. The
 * operands are inferred in the call's own frame, as the evaluator has them.
 */
export function checkCall(
	ast: CallAST,
	env: Env,
	report: CallReporter
): TypeValue | null {
	const inside = enterNode(ast, env)
	if (ast.head.kind === 'sym') {
		switch (ast.head.name) {
			case '?':
				return inferMatch(ast, inside)
			case '|>':
				return inferPipe(ast, inside)
			case '^': {
				const [value, typeAst] = ast.args
				const type = typeAst === undefined ? null : resolveTypeSlot(typeAst, inside)
				// What is said of the value, nearer than its type, goes over what the type says
				const said = type !== null && value !== undefined ? infer(value, inside)?.meta : undefined
				return said === undefined || type === null ? type : withTypeMeta(type, said)
			}
			// `(: T ...)` is a type expression, as a name of a type is
			case ':':
				return resolveTypeSlot(ast, inside)
			case 'overload':
				return null
		}
	}

	const overload = overloadOf(ast.head, inside)
	if (overload !== null) return overloadReturnType(overload, ast, inside)

	const head = infer(ast.head, inside)
	if (head === null) return null
	const shape = unwrapLazy(head).shape
	if (shape.kind === 'function') {
		const result = applyFunctionType(head, ast, inside, report)
		// Calling what makes a type, as `(enum ...)`, is a type expression.
		return result?.typeName === 'type'
			? (resolveTypeSlot(ast, inside) ?? result)
			: result
	}
	// A name for a type as a head is a type constructor, as in `(IO number)`.
	if (ast.head.kind === 'sym' && bareTypeOf(ast.head.name, inside)?.apply !== undefined) {
		return resolveTypeSlot(ast, inside)
	}
	if (shape.kind === 'vector' || shape.kind === 'tuple') {
		const index = ast.args[0]
		return index?.kind === 'lit' && typeof index.value === 'number'
			? memberType(head, index.value)
			: shape.kind === 'vector'
				? shape.element
				: null
	}
	if (shape.kind === 'record') {
		const key = ast.args[0]
		return key?.kind === 'lit' && typeof key.value === 'string'
			? memberType(head, key.value)
			: null
	}
	return null
}

/**
 * What a call's head says its parameters are called, without running anything.
 * Null when the head has no known signature. An overload goes by the first
 * variant that fits the arguments.
 */
export function callParameters(
	call: CallAST,
	env: Env
): CallParameters | null {
	const overload = overloadOf(call.head, env)
	if (overload !== null) {
		const variant = selectOverloadVariant(overload, call, env)
		return variant === null ? null : parametersOfType(variant.type)
	}
	const head = infer(call.head, env)
	return head === null ? null : parametersOfType(head)
}

function parametersOfType(type: TypeValue): CallParameters | null {
	const shape = unwrapLazy(type).shape
	if (shape.kind !== 'function') return null
	return {
		names: shape.paramNames ?? [],
		...(shape.variadicTail !== undefined
			? { variadicName: shape.variadicName ?? 'rest' }
			: {}),
	}
}

function overloadOf(head: AST, env: Env): OverloadValue | null {
	let inner: AST = head
	if (head.kind === 'sym') {
		const target = lookupBareName(head.name, env)
		if (target === null) return null
		inner = target.ast
	}
	if (inner.kind === 'meta') inner = inner.expr
	if (inner.kind !== 'host' && inner.kind !== 'lit') return null
	return isOverload(inner.value) ? inner.value : null
}

/**
 * Apply a function type to a call's arguments, solving generics as it goes:
 * first the arguments that say their own type, then function literals against
 * what those solved.
 */
function applyFunctionType(
	fnType: TypeValue,
	ast: CallAST,
	env: Env,
	report: CallReporter
): TypeValue | null {
	const shape = unwrapLazy(fnType).shape
	if (shape.kind !== 'function') return null
	const hasGenerics = (shape.generics?.length ?? 0) > 0
	const solution: Solution = new Map()

	const slots: Array<{ arg: AST; param: TypeValue }> = []
	if (!ast.args.some(arg => arg.kind === 'spread')) {
		ast.args.forEach((arg, i) => {
			const param = shape.paramTypes[i] ?? shape.variadicTail
			if (param !== undefined) slots.push({ arg, param })
			else {
				report(
					arg,
					`too many arguments: expected ${shape.paramTypes.length}, got ${ast.args.length}`
				)
			}
		})
		ast.kwargs?.forEach((arg, name) => {
			const index = shape.paramNames?.indexOf(name) ?? -1
			const param = index >= 0 ? shape.paramTypes[index] : undefined
			if (param !== undefined) slots.push({ arg, param })
		})
	}

	const isLiteral = (arg: AST): boolean => desugar(arg).kind === 'fn'
	const ordered = [
		...slots.filter(s => !isLiteral(s.arg)),
		...slots.filter(s => isLiteral(s.arg)),
	]
	for (const { arg, param } of ordered) {
		const actual = isLiteral(arg)
			? inferLiteralAgainst(desugar(arg) as FnAST, env, substitute(param, solution, 'keep'))
			: infer(arg, env)
		if (actual === null) continue
		let conflicted = false
		if (hasGenerics) {
			unify(param, actual, solution, (name, earlier, here) => {
				conflicted = true
				report(
					arg,
					`generic ${name} resolved to ${earlier.typeName} earlier but argument here is ${here.typeName}`
				)
			})
		}
		const expected = substitute(param, solution, 'top')
		if (!conflicted && !argFits(arg, actual, expected)) {
			report(arg, `type mismatch: expected ${expected.typeName}, got ${actual.typeName}`)
		}
	}
	return hasGenerics ? substitute(shape.returnType, solution, 'top') : shape.returnType
}

/**
 * The type of a function literal given what its slot expects. A parameter or
 * return declared `_` takes what is known from the slot and from the body, so
 * `#(+ % 1)` given a number is `(=> [number]: number)`.
 */
function inferLiteralAgainst(
	fn: FnAST,
	env: Env,
	expected: TypeValue
): TypeValue {
	const declared = functionTypeOfLiteral(fn, env)
	const shape = declared.shape
	const slot = unwrapLazy(expected).shape
	if (
		shape.kind !== 'function' ||
		slot.kind !== 'function' ||
		fn.body === null ||
		fn.generics.length > 0
	) {
		return declared
	}
	const isTop = (t: TypeValue): boolean => t.typeName === '_'
	const paramTypes = shape.paramTypes.map((t, i) => {
		const fromSlot = slot.paramTypes[i]
		return isTop(t) && fromSlot !== undefined && fromSlot.shape.kind !== 'var'
			? fromSlot
			: t
	})
	const returnType = isTop(shape.returnType)
		? (infer(fn.body, bodyFrame(fn, env, paramTypes)) ?? shape.returnType)
		: shape.returnType
	return makeFunctionType(paramTypes, returnType, {
		...(shape.paramNames !== undefined ? { paramNames: shape.paramNames } : {}),
		...(shape.variadicTail !== undefined ? { variadicTail: shape.variadicTail } : {}),
	})
}

/**
 * A frame for reading a function's body without calling it: each parameter
 * has its declared type and no value, and each generic is a type variable.
 */
export function bodyFrame(
	fn: FnAST,
	env: Env,
	paramTypes?: ReadonlyArray<TypeValue>
): Frame {
	const signature = functionTypeOfLiteral(fn, env).shape
	const bindings = new Map<string, BindingTarget>()
	const frame: Frame = { ast: fn, parent: env, bindings }
	for (const name of fn.generics) {
		bindings.set(name, { ast: new LitAST(makeTypeVar(name) as never), env: frame })
	}
	if (signature.kind === 'function') {
		const { paramNames = [], paramTypes: declared, variadicTail } = signature
		paramNames.forEach((name, i) => {
			const type = paramTypes?.[i] ?? declared[i] ?? top()
			bindings.set(name, { ast: new LitAST(UNIT), env: frame, type })
		})
		const variadic = fn.params.find(p => p.variadic)
		if (variadic !== undefined && variadicTail !== undefined) {
			bindings.set(variadic.name, {
				ast: new LitAST(UNIT),
				env: frame,
				type: makeTupleType([], variadicTail),
			})
		}
	}
	return frame
}

/** The type of the clauses of `?`: what they have in common, or else the union of them. */
function inferMatch(ast: CallAST, env: Env): TypeValue | null {
	const results: Array<TypeValue | null> = []
	for (let i = 2; i < ast.args.length; i += 2) {
		results.push(infer(ast.args[i]!, env))
	}
	const known = results.flatMap(type => (type === null ? [] : [type]))
	if (known.length === 0) return null
	if (known.length !== results.length) return null
	// Clauses with nothing in common come to any of them
	return joinTypes(known) ?? makeUnionType(known)
}

function inferPipe(ast: CallAST, env: Env): TypeValue | null {
	const [input, ...steps] = ast.args
	if (input === undefined) return null
	let flowing = infer(input, env)
	for (const step of steps) {
		if (flowing === null) return null
		const node = desugar(step)
		const fnType =
			node.kind === 'fn'
				? inferLiteralAgainst(node, env, makeFunctionType([flowing], top()))
				: infer(node, env)
		if (fnType === null) return null
		const shape = unwrapLazy(fnType).shape
		if (shape.kind !== 'function') return null
		const solution: Solution = new Map()
		const param = shape.paramTypes[0] ?? shape.variadicTail
		if (param !== undefined) unify(param, flowing, solution)
		flowing = substitute(shape.returnType, solution, 'top')
	}
	return flowing
}

/** The first variant whose parameters fit the arguments. */
function selectOverloadVariant(
	overload: OverloadValue,
	ast: CallAST,
	env: Env
): { type: TypeValue; returnType: TypeValue } | null {
	const argTypes = ast.args.map(arg => infer(arg, env))
	for (const variant of overload.variants) {
		const type = isTypedHostFn(variant)
			? functionTypeOfHost(variant)
			: functionTypeOfClosure(variant)
		const shape = type.shape
		if (shape.kind !== 'function') continue
		if (
			argTypes.length !== shape.paramTypes.length &&
			shape.variadicTail === undefined
		) {
			continue
		}
		const solution: Solution = new Map()
		const fits = argTypes.every((actual, i) => {
			const param = shape.paramTypes[i] ?? shape.variadicTail
			if (actual === null || param === undefined) return true
			unify(param, actual, solution)
			return typeFits(actual, substitute(param, solution, 'top'))
		})
		if (fits) {
			return { type, returnType: substitute(shape.returnType, solution, 'top') }
		}
	}
	return null
}

/** The return type of the first variant whose parameters fit the arguments. */
function overloadReturnType(
	overload: OverloadValue,
	ast: CallAST,
	env: Env
): TypeValue | null {
	return selectOverloadVariant(overload, ast, env)?.returnType ?? null
}
