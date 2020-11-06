import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type MaybePromise<T> = Promise<T> | T

// Primitives for both AST and PDG
type FnType = (...xs: Value[]) => MaybePromise<Value>

type Value = number | boolean | ValueFn

interface ValueFn {
	fn: FnType
	dataType: DataTypeFn
}

// AST
interface ASTFn {
	type: 'fn'
	def:
		| FnType
		| {
				params: string[]
				body: AST
		  }
	dataType: DataTypeFn
}

type ASymbol = string

type ASTFncall = {
	type: 'fncall'
	fn: AST
	params: AST[]
}

interface ASTGraph {
	type: 'graph'
	values: {[sym: string]: AST}
	return: ASymbol
}

export type AST = number | boolean | ASTFn | ASymbol | ASTFncall | ASTGraph

// Env
class Env {
	private outer?: Env

	private data: {[name: string]: PDG} = {}
	private resolvingSymbols = new Set<string>()

	constructor(values?: {[s: string]: PDG}, outer?: Env) {
		this.outer = outer

		if (values) {
			this.data = {...values}
		}
	}

	getAllSymbols(): {[name: string]: PDG} {
		const symbols = {
			...(this.outer ? this.outer.getAllSymbols() : {}),
			...this.data,
		}
		return symbols
	}

	clearDep() {
		for (const [, value] of Object.entries(this.data)) {
			value.dep.clear()
		}
	}

	get(s: string): PDG | undefined {
		return this.data[s] ?? this.outer?.get(s)
	}

	setResolving(s: string, flag: boolean) {
		this.resolvingSymbols[flag ? 'add' : 'delete'](s)
	}

	isResolving(s: string): boolean {
		return this.resolvingSymbols.has(s) || this.outer?.isResolving(s) || false
	}
}

// Functions
interface DataTypeFn {
	in: DataType[]
	out: DataType
}

export type DataType = 'number' | 'boolean' | DataTypeFn

function createJSFnPDG(
	fn: FnType,
	inTypes: DataType[],
	outType: DataType
): PDGFn {
	const dataType = {
		in: inTypes,
		out: outType,
	}

	return {
		type: 'fn',
		def: {
			type: 'js',
			value: fn,
			dataType: dataType,
		},
		resolved: {
			value: {
				fn: fn,
				dataType: dataType,
			},
		},
		dep: new Set(),
	}
}

const GlobalVariables = {
	'+': createJSFnPDG((a: any, b: any) => a + b, ['number', 'number'], 'number'),
	'*': createJSFnPDG((a: any, b: any) => a * b, ['number', 'number'], 'number'),
	'=': createJSFnPDG(
		(a: any, b: any) => a == b,
		['number', 'number'],
		'boolean'
	),
	not: createJSFnPDG((a: any) => !a, ['boolean'], 'boolean'),
	and: createJSFnPDG(
		(a: any, b: any) => a && b,
		['boolean', 'boolean'],
		'boolean'
	),
	or: createJSFnPDG(
		(a: any, b: any) => a || b,
		['boolean', 'boolean'],
		'boolean'
	),
	if: createJSFnPDG(
		(test: any, then: any, els: any) => (test ? then : els),
		['boolean', 'number', 'number'],
		'number'
	),
	neg: createJSFnPDG((a: any) => a * -1, ['number'], 'number'),
	PI: readAST(Math.PI),
	PI2: readAST(Math.PI * 2),
	E: readAST(Math.E),
} as {[s: string]: PDGAtom}

// PDG
interface PDGBase {
	parent?: Exclude<PDG, PDGValue>
	dep: Set<PDGSymbol>
}

type PDGResolvedError = Error

export interface PDGFncall extends PDGBase {
	type: 'fncall'
	fn: PDG
	params: PDG[]
	resolved?:
		| {
				fn: PDG
				dataType: DataTypeFn
				evaluated?: Promise<Value>
		  }
		| PDGResolvedError
}

export interface PDGGraph extends PDGBase {
	type: 'graph'
	values: {[sym: string]: PDG}
	return: string
	resolved?:
		| {
				env: Env
				ref: PDG
		  }
		| PDGResolvedError
}

export interface PDGSymbol extends PDGBase {
	type: 'symbol'
	name: string
	resolved?:
		| {
				ref: PDG
		  }
		| PDGResolvedError
}

export interface PDGFn extends PDGBase {
	type: 'fn'
	def:
		| {
				type: 'js'
				value: FnType
				dataType: DataTypeFn
		  }
		| {
				type: 'expr'
				params: string[]
				body: PDG
				dataType: DataTypeFn
		  }
	resolved?:
		| {
				value: ValueFn
		  }
		| PDGResolvedError
}

export interface PDGValue extends PDGBase {
	type: 'value'
	value: Value
}

type PDGAtom = PDGValue | PDGFn

export type PDG = PDGFncall | PDGSymbol | PDGGraph | PDGFn | PDGValue

export function printPDG(pdg: PDG): string {
	switch (pdg.type) {
		case 'value':
			return printValue(pdg.value)
		case 'fn': {
			const def = pdg.def
			const dataType = def.dataType
			if (def.type === 'expr') {
				const paramsStr = def.params
					.map((p, i) => p + ': ' + printDataType(dataType.in[i]))
					.join(' ')
				const bodyStr = printPDG(def.body) + ' : ' + printDataType(dataType.out)
				return `#(${paramsStr} => ${bodyStr})`
			} else {
				return 'js func'
			}
		}
		case 'fncall': {
			const fn = printPDG(pdg.fn)
			const params = pdg.params.map(printPDG).join(' ')
			return `(${fn} ${params})`
		}
		case 'graph': {
			const values = Object.entries(pdg.values)
				.map(([s, v]) => `${s} ${printPDG(v)}`)
				.join(' ')
			return `{${values} ${pdg.return}}`
		}
		case 'symbol':
			return pdg.name
	}
}

function getAllRefs(pdg: PDG): Set<PDG> {
	switch (pdg.type) {
		case 'fn':
			if (pdg.def.type === 'expr') {
				return new Set([pdg.def.body])
			}
			break
		case 'fncall':
			return new Set([pdg.fn, ...pdg.params])
		case 'graph':
			return new Set(Object.values(pdg.values))
		case 'symbol':
			if (pdg.resolved && !(pdg.resolved instanceof Error)) {
				return new Set([pdg.resolved.ref])
			}
			break
	}
	return new Set()
}

function getAllDeps(pdg: PDG): PDG[] {
	const dep: PDG[] = Array.from(pdg.dep)
	if (pdg.parent) {
		dep.unshift(pdg.parent)
	}
	return dep
}

export function swapPDG(oldPdg: PDG, newPdg: PDG) {
	const swapped = new Map<PDG, PDG>()

	traverse(oldPdg, newPdg)

	return swapped

	function traverse(op: PDG, np: PDG) {
		swapped.set(op, np)

		if (op.type === 'symbol') {
			getAllRefs(op).forEach(r => r.dep.delete(op))
			op.resolved = undefined
		}

		getAllDeps(op).forEach(od => {
			let nd = swapped.get(od) as typeof od | undefined

			switch (od.type) {
				case 'fn': {
					nd = (nd as PDGFn) ?? {...od, resolved: undefined}
					if (nd.def.type === 'expr') {
						nd.def = {...nd.def, body: np}
					}
					return traverse(od, nd)
				}
				case 'fncall': {
					nd = (nd as PDGFncall) ?? {
						...od,
						params: [...od.params],
						resolved: undefined,
					}
					if (nd.fn === op) {
						nd.fn = np
					}
					for (let i = 0; i < nd.params.length; i++) {
						if (nd.params[i] === op) {
							nd.params[i] = np
						}
					}
					return traverse(od, nd)
				}
				case 'graph': {
					nd = (nd as PDGGraph) ?? {
						...od,
						values: {...od.values},
						resolved: undefined,
					}
					for (const sym in nd.values) {
						if (nd.values[sym] === op) {
							nd.values[sym] = np
						}
					}
					return traverse(od, nd)
				}
				case 'symbol': {
					nd = (nd as PDGSymbol) ?? {...od, resolved: undefined}
					return traverse(od, nd)
				}
			}
		})
	}
}

export function readStr(str: string): AST {
	return parser.parse(str)
}

export function readAST(ast: AST): PDG {
	if (ast instanceof Object) {
		if (ast.type === 'fncall') {
			const {fn, params} = ast
			return {
				type: 'fncall',
				fn: readAST(fn),
				params: params.map(readAST),
				dep: new Set(),
			}
		} else if (ast.type === 'fn') {
			// Function
			if (ast.def instanceof Function) {
				// JS Defined
				return {
					type: 'fn',
					def: {type: 'js', value: ast.def, dataType: ast.dataType},
					dep: new Set(),
				}
			} else {
				// Expression
				return {
					type: 'fn',
					def: {
						type: 'expr',
						params: ast.def.params,
						body: readAST(ast.def.body),
						dataType: ast.dataType,
					},
					dep: new Set(),
				}
			}
		} else {
			// Graph
			const values = Object.fromEntries(
				Object.entries(ast.values).map(([s, a]) => [s, readAST(a)])
			)
			return {
				type: 'graph',
				values,
				return: ast.return,
				dep: new Set(),
			}
		}
	} else {
		if (typeof ast === 'string') {
			// Symbol
			return {
				type: 'symbol',
				name: ast,
				dep: new Set(),
			}
		} else {
			// Number / Boolean
			return {
				type: 'value',
				value: ast,
				dep: new Set(),
			}
		}
	}
}

export function getDataType(pdg: PDG): DataType | null {
	switch (pdg.type) {
		case 'value':
			if (pdg.value instanceof Object) {
				return pdg.value.dataType
			} else {
				switch (typeof pdg.value) {
					case 'boolean':
						return 'boolean'
					case 'number':
						return 'number'
					default:
						return null
				}
			}
		case 'symbol':
		case 'graph':
			return pdg.resolved && !(pdg.resolved instanceof Error)
				? getDataType(pdg.resolved.ref)
				: null
		case 'fncall':
			return pdg.resolved && !(pdg.resolved instanceof Error)
				? pdg.resolved.dataType.out
				: null
		case 'fn':
			return pdg.def.dataType
	}
}

export function setDirty(pdg: PDG) {
	if (
		pdg.type === 'fncall' &&
		pdg.resolved &&
		!(pdg.resolved instanceof Error) &&
		pdg.resolved.evaluated
	) {
		pdg.resolved.evaluated = undefined
	}

	getAllDeps(pdg).forEach(setDirty)
}

export function isEqualDataType(a: DataType, b: DataType): boolean {
	if (typeof a === 'string') {
		return a === b
	} else {
		if (typeof b === 'string') {
			return false
		}
		return isEqualDataTypeFn(a, b)
	}

	function isEqualDataTypeFn(a: DataTypeFn, b: DataTypeFn) {
		return (
			isEqualDataType(a.out, b.out) &&
			a.in.length === b.in.length &&
			a.in.every((ai, i) => isEqualDataType(ai, b.in[i]))
		)
	}
}

const GlobalEnv = new Env(GlobalVariables)

export function getSymbols(pdg: PDG): {[sym: string]: PDG} {
	if (pdg.type === 'graph') {
		if (pdg.resolved && !(pdg.resolved instanceof Error)) {
			return pdg.resolved.env.getAllSymbols()
		}
	} else {
		if (pdg.parent) {
			return getSymbols(pdg.parent)
		}
	}
	return GlobalEnv.getAllSymbols()
}

export function analyzePDG(pdg: PDG): PDG {
	setParents(pdg)

	return traverse(pdg, GlobalEnv)

	function setParents(pdg: PDG) {
		if (pdg.type !== 'value') {
			getAllRefs(pdg).forEach(r => {
				r.parent = pdg
				setParents(r)
			})
		}
	}

	function traverse(pdg: PDG, env: Env): PDG {
		// Return resolved value
		if (pdg.type === 'value' || pdg.resolved) {
			return pdg
		}

		if (pdg.type === 'fncall') {
			// Function Call

			// Resolve parameters
			const {params} = pdg
			params.forEach(p => traverse(p, env))

			traverse(pdg.fn, env)

			const fnPdg = traverse(pdg.fn, env)

			const dataType = getDataType(fnPdg)

			if (dataType === null || typeof dataType === 'string') {
				pdg.resolved = new Error('Not a function')
				return pdg
			}

			// Type Checking
			const paramDataTypes = params.map(getDataType)

			if (paramDataTypes.some(dt => dt === null)) {
				pdg.resolved = new Error('Uncooked param in child')
				return pdg
			}

			if (
				paramDataTypes.length !== dataType.in.length ||
				paramDataTypes.some(
					(pdt, i) => pdt === null || !isEqualDataType(pdt, dataType.in[i])
				)
			) {
				pdg.resolved = new Error(
					`Parameter unmatched expected=(${dataType.in
						.map(printDataType)
						.join(' ')}) passed=(${paramDataTypes
						.map(dt => (dt !== null ? printDataType(dt) : 'null'))
						.join(' ')})`
				)
				return pdg
			}

			// Resolved
			pdg.resolved = {
				dataType,
				fn: fnPdg,
			}
		} else if (pdg.type === 'graph') {
			// Graph

			// Create new env
			const innerEnv = new Env(pdg.values, env)

			// Resolve inners
			Object.entries(pdg.values).map(([s, p]) => {
				innerEnv.setResolving(s, true)
				traverse(p, innerEnv)
				innerEnv.setResolving(s, false)
			})

			// Check if return symbol is invalid
			if (!(pdg.return in pdg.values)) {
				pdg.resolved = new Error(
					`Return symbol ${pdg.return} is not defined in the graph`
				)
				return pdg
			}

			// Resolve
			const ref = pdg.values[pdg.return]

			pdg.resolved = {
				env: innerEnv,
				ref,
			}
		} else if (pdg.type === 'symbol') {
			// Symbol

			// Check circular reference
			if (env.isResolving(pdg.name)) {
				pdg.resolved = new Error(`Circular reference: ${pdg.name}`)
				return pdg
			}

			// Check if symbol is defined in the env
			const ref = env.get(pdg.name)
			if (!ref) {
				pdg.resolved = new Error(`Undefined identifer: ${pdg.name}`)
				return pdg
			}

			// Add to dependency
			ref.dep.add(pdg)

			// Resolve
			pdg.resolved = {
				ref,
			}
		} else if (pdg.type === 'fn') {
			if (pdg.def.type === 'js') {
				// JS Function
				pdg.resolved = {
					value: {
						fn: pdg.def.value,
						dataType: pdg.def.dataType,
					},
				}
			} else {
				// Resolve inside function body
				const {params, body} = pdg.def
				const paramsPDG: [string, PDGValue][] = params.map(name => [
					name,
					{type: 'value', value: 1, dep: new Set()},
				])

				const fnEnv = new Env(Object.fromEntries(paramsPDG), env)

				traverse(body, fnEnv)

				const fn: FnType = async (...params: Value[]) => {
					paramsPDG.forEach(([, sym]) => setDirty(sym))
					paramsPDG.forEach(([, sym], i) => (sym.value = params[i]))
					return await evalPDG(body)
				}

				pdg.resolved = {
					value: {
						fn,
						dataType: pdg.def.dataType,
					},
				}
			}
		}

		return pdg
	}
}

export async function evalPDG(pdg: PDG): Promise<Value> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if (!pdg.resolved) {
		return Promise.reject('Not yet resolved')
	}

	if (pdg.resolved instanceof Error) {
		return Promise.reject(pdg.resolved.message)
	}

	switch (pdg.type) {
		case 'fn':
			return pdg.resolved.value
		case 'symbol':
		case 'graph':
			return evalPDG(pdg.resolved.ref)
		case 'fncall': {
			if (pdg.resolved.evaluated) return await pdg.resolved.evaluated

			const {
				params,
				resolved: {fn: fnPdg},
			} = pdg

			pdg.resolved.evaluated = Promise.all([
				evalPDG(fnPdg),
				...params.map(evalPDG),
			]).then(([fn, ...ps]) => (fn as ValueFn).fn(...ps))

			return await pdg.resolved.evaluated
		}
	}
}

export function printDataType(dt: DataType | null): string {
	if (dt === null) {
		return 'undetermined'
	} else if (typeof dt === 'string') {
		return dt
	} else {
		const inStr = dt.in.map(printDataType).join(' ')
		const outStr = printDataType(dt.out)
		return `(${inStr} -> ${outStr})`
	}
}

export function printValue(value: Value): string {
	if (value instanceof Object) {
		return printDataType(value.dataType)
	} else {
		switch (typeof value) {
			case 'number':
				return value.toFixed(4).replace(/\.?[0]+$/, '')
			case 'boolean':
				return value.toString()
			default:
				return ''
			// 	throw new Error('Cannt print value')
		}
	}
}

// test code
async function test(str: string, expected: number | boolean | 'error') {
	let result: Value
	try {
		const ast = readStr(str)
		result = await evalPDG(analyzePDG(readAST(ast)))
	} catch (err) {
		const invalid = expected !== 'error'
		console[invalid ? 'error' : 'info'](
			invalid ? 'ERROR:' : 'OK:',
			'str=',
			str,
			'expected=',
			expected,
			'result=',
			err
		)
		return
	}
	const invalid = result !== expected
	console[invalid ? 'error' : 'info'](
		invalid ? 'ERROR:' : 'OK:',
		'str=',
		str,
		'expected=',
		expected,
		'result=',
		result
	)
}

;(async function () {
	await test('(+ 1 2)', 3)
	await test('(+ 1 (+ 2 3))', 6)
	await test('(and true (= 1 2))', false)
	await test('(#(x : number => (+ x 1) : number) 1)', 2)
	await test(
		'((#(x: number => #(y: number => (+ x y): number): (number -> number)) 1) 2)',
		3
	)
	await test('{a (+ 1 2) a}', 3)
	await test('{a b b a c (+ 1 2) c}', 3)
	await test('(+ {a 10 b (* a 2) b} 1)', 21)
	await test('{a a a}', 'error')
	await test('{a 10 b {a 20 a} c (+ a b) c}', 30)
})()
