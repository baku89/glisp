import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type FnType = (...xs: number[]) => MaybePromise<number | FnType>

// AST
interface AFn {
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

type AFncall = {
	type: 'fncall'
	fn: ASymbol
	params: AST[]
}

type MaybePromise<T> = Promise<T> | T

interface AGraph {
	type: 'graph'
	values: {[sym: string]: AST}
	return: ASymbol
}

type AST = number | AFn | ASymbol | AFncall | AGraph

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

type DataType = 'number' | DataTypeFn

const GlobalEnvs = {
	'+': {
		type: 'fn',
		def: {type: 'js', value: (a, b) => a + b},
		dataType: {
			in: ['number', 'number'],
			out: 'number',
		},
		resolved: {
			result: 'succeed',
			fn: (a, b) => a + b,
		},
		dup: new Set(),
	},
	'*': {
		type: 'fn',
		def: {type: 'js', value: (a, b) => a * b},
		dataType: {
			in: ['number', 'number'],
			out: 'number',
		},
		resolved: {
			result: 'succeed',
			fn: (a, b) => a * b,
		},
		dup: new Set(),
	},
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
	fn: PDGSymbol | PDGFn
	params: PDG[]
	resolved?:
		| {
				result: 'succeed'
				fn: FnType
				dataType: DataTypeFn
				evaluated?: Promise<number>
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
	def: {type: 'js'; value: FnType} | {type: 'expr'; params: string[]; body: PDG}
	dataType: DataTypeFn
	resolved?:
		| {
				result: 'succeed'
				fn: FnType
		  }
		| PDGResolvedError
}

interface PDGValue extends PDGBase {
	type: 'value'
	value: number
}

type PDGAtom = PDGValue | PDGFn

export async function getEvaluated(pdg: PDG): Promise<number | FnType | null> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if (pdg.type === 'symbol' || pdg.type === 'graph') {
		if (!pdg.resolved || pdg.resolved.result === 'error') {
			return null
		}

		return getEvaluated(pdg.resolved.ref)
	} else if (pdg.type === 'fncall') {
		// Fncall
		if (
			!pdg.resolved ||
			pdg.resolved.result === 'error' ||
			!pdg.resolved.evaluated
		) {
			return null
		}

		return await pdg.resolved.evaluated
	} else {
		if (!pdg.resolved || pdg.resolved.result === 'error') {
			return null
		}
		return pdg.resolved.fn
	}
}

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
				fn: {
					type: 'symbol',
					name: fn,
					dup: new Set(),
				},
				params: params.map(readAST),
				dup: new Set(),
			}
		} else if (ast.type === 'fn') {
			// Function
			if (ast.def instanceof Function) {
				// JS Defined
				return {
					type: 'fn',
					def: {type: 'js', value: ast.def},
					dataType: ast.dataType,
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
					},
					dataType: ast.dataType,
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
			return 'number'
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
			return pdg.dataType
	}
}

function getPDGFn(pdg: PDG): PDGFn | null {
	switch (pdg.type) {
		case 'fn':
			return pdg
		case 'symbol':
			if (pdg.resolved?.result === 'succeed') {
				return getPDGFn(pdg.resolved.ref)
			}
	}
	return null
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
			a.in.every((_a, i) => isEqualDataType(_a, b.in[i]))
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

			const fnPdg = getPDGFn(pdg.fn)

			// IF fn has not yet resolved
			if (!fnPdg || !(fnPdg.resolved?.result === 'succeed')) {
				pdg.resolved = {
					result: 'error',
					message: 'Undefined identifer',
				}
				return pdg
			}

			const {dataType} = fnPdg

			// Type Checking: invalid length of parmeter
			if (params.length !== dataType.in.length) {
				pdg.resolved = {
					result: 'error',
					message: 'Number of parameter unmatched',
				}
				return pdg
			}

			// Type Checking: Unmatched parameters
			const inDataTypes = params.map(getDataType)
			if (
				inDataTypes.some(
					(dt, i) => dt === null || !isEqualDataType(dt, dataType.in[i])
				)
			) {
				pdg.resolved = {
					result: 'error',
					message: `Parameter unmatched`,
				}
				return pdg
			}

			// Resolved
			pdg.resolved = {
				result: 'succeed',
				dataType,
				fn: fnPdg.resolved.fn,
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
				pdg.resolved = {
					result: 'succeed',
					fn: pdg.def.value,
				}
			} else {
				// Resolve inside function body
				const {params, body} = pdg.def
				const paramsPDG: [string, PDGSymbol][] = params.map(name => {
					return [
						name,
						{type: 'symbol', name, resolved: {result: 'succeed'}},
					] as any
				})

				const fnEnv = new Env(Object.fromEntries(paramsPDG), env)

				traverse(body, fnEnv, null)

				const fn: FnType = (...params: number[]) => {
					paramsPDG.forEach(([, sym], i) => {
						sym.resolved = {
							result: 'succeed',
							ref: {
								type: 'value',
								value: params[i],
								dup: new Set(),
							},
						}
					})

					return evalPDG(body)
				}

				pdg.resolved = {
					result: 'succeed',
					fn,
				}
			}
		}

		return pdg
	}
}

export async function evalPDG(pdg: PDG): Promise<number | FnType> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if (!pdg.resolved) {
		return Promise.reject('Not yet resolved')
	}

	if (pdg.resolved.result === 'error') {
		return Promise.reject(pdg.resolved.message)
	}

	if (pdg.type === 'symbol') {
		return evalPDG(pdg.resolved.ref)
	} else if (pdg.type === 'graph') {
		return evalPDG(pdg.resolved.ref)
	} else if (pdg.type === 'fncall') {
		if (pdg.resolved.evaluated) return await pdg.resolved.evaluated

		const {
			params,
			resolved: {fn},
		} = pdg

		pdg.resolved.evaluated = Promise.all(params.map(evalPDG)).then(ps =>
			(fn as any)(...ps)
		)

		return await pdg.resolved.evaluated
	}
	// fn
	return pdg.resolved.fn
}

export async function rep(str: string) {
	const ast = readStr(str)
	const pdg = analyzePDG(readAST(ast))
	const ret = await evalPDG(pdg)
	return ret.toString()
}

// test code
async function test(str: string, expected: number | 'error') {
	let result: number | FnType
	try {
		result = await evalPDG(analyzePDG(readAST(readStr(str))))
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
	await test('{a (+ 1 2) a}', 3)
	await test('{a b b a c (+ 1 2) c}', 3)
	await test('(+ {a 10 b (* a 2) b} 1)', 21)
	await test('{a a a}', 'error')
	await test('{a 10 b {a 20 a} c (+ a b) c}', 30)
})()
