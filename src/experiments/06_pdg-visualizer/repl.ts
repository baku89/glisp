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

type AST = number | ASTFn | ASymbol | ASTFncall | ASTGraph

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

type DataType = 'number' | 'boolean' | DataTypeFn

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
			result: 'succeed',
			value: {
				fn: fn,
				dataType: dataType,
			},
		},
		dup: new Set(),
	}
}

const GlobalEnvs = {
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
} as {[s: string]: PDGAtom}

// PDG
interface PDGBase {
	dup: Set<PDG>
}

interface PDGResolvedError {
	result: 'error'
	message: string
}

interface PDGFncall extends PDGBase {
	type: 'fncall'
	fn: PDG
	params: PDG[]
	resolved?:
		| {
				result: 'succeed'
				fn: PDG
				dataType: DataTypeFn
				evaluated?: Promise<Value>
		  }
		| PDGResolvedError
}

interface PDGGraph extends PDGBase {
	type: 'graph'
	values: {[sym: string]: PDG}
	return: string
	resolved?:
		| {
				result: 'succeed'
				ref: PDG
		  }
		| PDGResolvedError
}

interface PDGSymbol extends PDGBase {
	type: 'symbol'
	name: string
	resolved?:
		| {
				result: 'succeed'
				ref: PDG
		  }
		| PDGResolvedError
}

interface PDGFn extends PDGBase {
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
				result: 'succeed'
				value: ValueFn
		  }
		| PDGResolvedError
}

interface PDGValue extends PDGBase {
	type: 'value'
	value: Value
}

type PDGAtom = PDGValue | PDGFn

export type PDG = PDGFncall | PDGSymbol | PDGGraph | PDGFn | PDGValue

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
				dup: new Set(),
			}
		} else if (ast.type === 'fn') {
			// Function
			if (ast.def instanceof Function) {
				// JS Defined
				return {
					type: 'fn',
					def: {type: 'js', value: ast.def, dataType: ast.dataType},

					dup: new Set(),
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

					dup: new Set(),
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
				dup: new Set(),
			}
		}
	} else {
		if (typeof ast === 'string') {
			// Symbol
			return {
				type: 'symbol',
				name: ast,
				dup: new Set(),
			}
		} else {
			// Number
			return {
				type: 'value',
				value: ast,
				dup: new Set(),
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
			return pdg.resolved?.result === 'succeed'
				? getDataType(pdg.resolved.ref)
				: null
		case 'fncall':
			return pdg.resolved?.result === 'succeed'
				? pdg.resolved.dataType.out
				: null
		case 'fn':
			return pdg.def.dataType
	}
}

function setDirty(pdg: PDG) {
	if (
		pdg.type === 'fncall' &&
		pdg.resolved?.result === 'succeed' &&
		pdg.resolved.evaluated
	) {
		pdg.resolved.evaluated = undefined
	}

	pdg.dup.forEach(setDirty)
}

function isEqualDataType(a: DataType, b: DataType): boolean {
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

export function analyzePDG(pdg: PDG): PDG {
	return traverse(pdg, new Env(GlobalEnvs), null)

	function traverse(pdg: PDG, env: Env, dup: PDG | null): PDG {
		if (dup) {
			pdg.dup.add(dup)
		}

		if (pdg.type === 'value' || pdg.resolved) {
			return pdg
		}

		if (pdg.type === 'fncall') {
			// Function Call

			// Resolve parameters
			const {params} = pdg
			params.forEach(p => traverse(p, env, pdg))

			traverse(pdg.fn, env, pdg)

			const fnPdg = traverse(pdg.fn, env, pdg)

			const dataType = getDataType(fnPdg)

			if (dataType === null || typeof dataType === 'string') {
				pdg.resolved = {
					result: 'error',
					message: 'Not a function',
				}
				return pdg
			}

			// Type Checking
			const paramDataTypes = params.map(getDataType)
			if (
				paramDataTypes.some(
					(pdt, i) => pdt === null || !isEqualDataType(pdt, dataType.in[i])
				)
			) {
				pdg.resolved = {
					result: 'error',
					message: `Parameter unmatched expected=(${dataType.in
						.map(printDataType)
						.join(' ')}) passed=(${paramDataTypes
						.map(dt => (dt !== null ? printDataType(dt) : 'null'))
						.join(' ')})`,
				}
				return pdg
			}

			// Resolved
			pdg.resolved = {
				result: 'succeed',
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
				traverse(p, innerEnv, null)
				innerEnv.setResolving(s, false)
			})

			// Check if return symbol is invalid
			if (!(pdg.return in pdg.values)) {
				pdg.resolved = {
					result: 'error',
					message: `Return symbol ${pdg.return} is not defined in the graph`,
				}
				return pdg
			}

			// Resolve
			const ref = pdg.values[pdg.return]
			ref.dup.add(pdg)

			pdg.resolved = {
				result: 'succeed',
				ref,
			}
		} else if (pdg.type === 'symbol') {
			// Symbol

			// Check circular reference
			if (env.isResolving(pdg.name)) {
				pdg.resolved = {
					result: 'error',
					message: `Circular reference: ${pdg.name}`,
				}
				return pdg
			}

			// Check if symbol is defined in the env
			const ref = env.get(pdg.name)
			if (!ref) {
				pdg.resolved = {
					result: 'error',
					message: `Undefined identifer: ${pdg.name}`,
				}
				return pdg
			}

			// Add to dependency
			ref.dup.add(pdg)

			// Resolve
			pdg.resolved = {
				result: 'succeed',
				ref,
			}
		} else if (pdg.type === 'fn') {
			if (pdg.def.type === 'js') {
				// JS Function
				pdg.resolved = {
					result: 'succeed',
					value: {
						fn: pdg.def.value,
						dataType: pdg.def.dataType,
					},
				}
			} else {
				// Resolve inside function body
				const {params, body} = pdg.def
				const paramsPDG: [string, PDGValue][] = params.map(name => {
					return [
						name,
						{
							type: 'value',
							value: 0,
							dup: new Set(),
						},
					]
				})

				const fnEnv = new Env(Object.fromEntries(paramsPDG), env)

				traverse(body, fnEnv, null)

				const fn: FnType = async (...params: Value[]) => {
					paramsPDG.forEach(([, sym]) => setDirty(sym))
					paramsPDG.forEach(([, sym], i) => (sym.value = params[i]))
					return await evalPDG(body)
				}

				pdg.resolved = {
					result: 'succeed',
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

	if (pdg.resolved.result === 'error') {
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

export function printDataType(dt: DataType): string {
	if (typeof dt === 'string') {
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
		}
	}
}

export async function rep(str: string) {
	const ast = readStr(str)
	const pdg = analyzePDG(readAST(ast))
	const ret = await evalPDG(pdg)
	return ret.toString()
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
