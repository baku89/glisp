import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type FnType = (...xs: number[]) => MaybePromise<number>

// AST
interface AFn {
	type: 'fn'
	value: FnType
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

type EnvData = EnvPDGData | EnvASTData

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

interface PDGValueFn {
	fn: FnType
	dataType: DataTypeFn
}

const GlobalEnvs = {
	'+': {
		type: 'value',
		value: {
			fn: (a, b) => a + b,
			dataType: {
				in: ['number', 'number'],
				out: 'number',
			},
		},
	},
	'-': {
		type: 'value',
		value: {
			fn: (a, b) => a - b,
			dataType: {
				in: ['number', 'number'],
				out: 'number',
			},
		},
	},
	'*': {
		type: 'value',
		value: {
			fn: (a, b) => a * b,
			dataType: {
				in: ['number', 'number'],
				out: 'number',
			},
		},
	},
	'/': {
		type: 'value',
		value: {
			fn: (a, b) => a / b,
			dataType: {
				in: ['number', 'number'],
				out: 'number',
			},
		},
	},
	neg: {
		type: 'value',
		value: {
			fn: a => -a,
			dataType: {
				in: ['number'],
				out: 'number',
			},
		},
	},
} as {[s: string]: PDGValue}

// PDG
interface PDGError {
	result: 'error'
	message: string
}

interface PDGFncall {
	type: 'fncall'
	name: string
	params: PDG[]
	resolved?:
		| {
				result: 'succeed'
				fn: FnType
				dataType: DataTypeFn
				evaluated?: Promise<number>
		  }
		| PDGError
}

interface PDGGraph {
	type: 'graph'
	values: {[sym: string]: PDG}
	return: string
	resolved?:
		| {
				result: 'succeed'
				ref: PDG
		  }
		| PDGError
}

interface PDGSymbol {
	type: 'symbol'
	name: string
	resolved?:
		| {
				result: 'succeed'
				ref: PDG
		  }
		| PDGError
}

type PDGValueContent = number | PDGValueFn

interface PDGValue {
	type: 'value'
	value: PDGValueContent
}

export async function getEvaluated(pdg: PDG): Promise<PDGValueContent | null> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if (pdg.type === 'symbol' || pdg.type === 'graph') {
		if (!pdg.resolved || pdg.resolved.result === 'error') {
			return null
		}

		return getEvaluated(pdg.resolved.ref)
	} else {
		// Fncall
		if (
			!pdg.resolved ||
			pdg.resolved.result === 'error' ||
			!pdg.resolved.evaluated
		) {
			return null
		}

		return await pdg.resolved.evaluated
	}
}

export type PDG = PDGFncall | PDGSymbol | PDGGraph | PDGValue

export function readStr(str: string): AST {
	const ast = parser.parse(str)
	console.log(ast)
	return ast
}

export function readAST(ast: AST): PDG {
	if (ast instanceof Object) {
		if (ast.type === 'fncall') {
			const {fn, params} = ast
			return {
				type: 'fncall',
				name: fn,
				params: params.map(readAST),
			}
		} else if (ast.type === 'fn') {
			return {
				type: 'value',
				value: {
					fn: ast.value,
					dataType: ast.dataType,
				},
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
			}
		}
	} else {
		if (typeof ast === 'string') {
			return {
				type: 'symbol',
				name: ast,
			}
		} else {
			// Number
			return {
				type: 'value',
				value: ast,
			}
		}
	}
}

export function getDataType(pdg: PDG): DataType | null {
	if (pdg.type === 'value') {
		return 'number'
	} else if (pdg.type === 'symbol' || pdg.type === 'graph') {
		if (pdg.resolved?.result === 'succeed') {
			return getDataType(pdg.resolved.ref)
		} else {
			return null
		}
	} else {
		// fncall
		if (pdg.resolved?.result === 'succeed') {
			return pdg.resolved.dataType.out
		} else {
			return null
		}
	}
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
	traverse(pdg, new Env(GlobalEnvs))
	return pdg

	function traverse(pdg: PDG, env: Env) {
		if (pdg.type === 'fncall') {
			// Function Call

			// Check if resolved
			if (pdg.resolved) return

			// Resolve parameters
			pdg.params.forEach(p => traverse(p, env))

			const {name, params} = pdg

			const v = env.get(name)

			if (!v) {
				pdg.resolved = {
					result: 'error',
					message: `Undefined function: ${name}`,
				}
				return
			}

			if (v.type !== 'value' || typeof v.value === 'number') {
				pdg.resolved = {
					result: 'error',
					message: `${name} is not a function`,
				}
				return
			}

			const {fn, dataType} = v.value

			// Type Checking
			if (params.length !== dataType.in.length) {
				pdg.resolved = {
					result: 'error',
					message: 'Number of parameter unmatched',
				}
				return
			}

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
				return
			}

			pdg.resolved = {
				result: 'succeed',
				dataType,
				fn,
			}
		} else if (pdg.type === 'graph') {
			// Graph

			// Check if resolved
			if (pdg.resolved) return

			// Create new env
			const innerEnv = new Env(pdg.values, env)

			// Resolve inners
			Object.entries(pdg.values).map(([s, p]) => {
				innerEnv.setResolving(s, true)
				traverse(p, innerEnv)
				innerEnv.setResolving(s, false)
			})

			// Resolve return symbol
			if (!(pdg.return in pdg.values)) {
				pdg.resolved = {
					result: 'error',
					message: `Return symbol ${pdg.return} is not defined in the graph`,
				}
				return
			}

			pdg.resolved = {
				result: 'succeed',
				ref: pdg.values[pdg.return],
			}
		} else if (pdg.type === 'symbol') {
			// Symbol

			// Check if resolved
			if (pdg.resolved) return

			if (env.isResolving(pdg.name)) {
				pdg.resolved = {
					result: 'error',
					message: `Circular reference: ${pdg.name}`,
				}
				return
			}

			const ref = env.get(pdg.name)
			if (!ref) {
				pdg.resolved = {
					result: 'error',
					message: `Undefined identifer: ${pdg.name}`,
				}
				return
			}

			pdg.resolved = {
				result: 'succeed',
				ref,
			}
		}
	}
}

export async function evalPDG(pdg: PDG): Promise<PDGValueContent> {
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
	} else {
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
}

export async function rep(str: string) {
	const ast = readStr(str)
	const pdg = analyzePDG(readAST(ast))
	const ret = await evalPDG(pdg)
	return ret.toString()
}

// test code
async function test(str: string, expected: number | 'error') {
	let result: PDGValueContent
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
