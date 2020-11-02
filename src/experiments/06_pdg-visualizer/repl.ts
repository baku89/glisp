import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

// AST
type ASymbol = string
type AFncall = {
	type: 'fncall'
	fn: ASymbol
	params: AST[]
}

type AFunction = (...xs: number[]) => Promise<number> | number

interface AGraph {
	type: 'graph'
	values: {[sym: string]: AST}
	return: ASymbol
}

type AST = number | ASymbol | AFncall | AGraph

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
interface PDGFn {
	fn: AFunction
	paramCount: number
}

const Functions = {
	'+': {
		fn: (a, b) => a + b,
		paramCount: 2,
	},
	'-': {
		fn: (a, b) => a - b,
		paramCount: 2,
	},
	'*': {
		fn: (a, b) => a * b,
		paramCount: 2,
	},
	'/': {
		fn: (a, b) => a / b,
		paramCount: 2,
	},
	neg: {
		fn: a => -a,
		paramCount: 1,
	},
} as {[s: string]: PDGFn}

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
				fn: AFunction
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

interface PDGValue {
	type: 'value'
	value: number
}

export async function getEvaluated(pdg: PDG): Promise<number | null> {
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
	return parser.parse(str)
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

export function analyzePDG(pdg: PDG): PDG {
	traverse(pdg, new Env())
	return pdg

	function traverse(pdg: PDG, env: Env) {
		if (pdg.type === 'fncall') {
			// Function Call

			// Check if resolved
			if (pdg.resolved) return

			// Traverse children
			pdg.params.forEach(p => traverse(p, env))

			const {name, params} = pdg

			if (!(name in Functions)) {
				pdg.resolved = {
					result: 'error',
					message: `Undefined function: ${name}`,
				}
				return
			}

			const {fn, paramCount} = Functions[name]

			if (params.length !== paramCount) {
				pdg.resolved = {
					result: 'error',
					message: `Invalid parameter`,
				}
				return
			}

			pdg.resolved = {
				result: 'succeed',
				fn,
			}
		} else if (pdg.type === 'graph') {
			// Graph

			// Check if resolved
			if (pdg.resolved) return

			// Create new env
			const innerEnv = new Env(pdg.values, env)

			Object.entries(pdg.values).map(([s, p]) => {
				innerEnv.setResolving(s, true)
				traverse(p, innerEnv)
				innerEnv.setResolving(s, false)
			})

			// Resolve return symbol
			if (!(pdg.return in pdg.values)) {
				pdg.resolved = {
					result: 'error',
					message: `Cannot resolve return symbol ${pdg.return}`,
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

export async function evalPDG(pdg: PDG): Promise<number> {
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
			fn(...ps)
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
	let result: number
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
			err.message
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
	await test('{a a a}', 'error')
	await test('{a 10 b {a 20 a} c (+ a b) c}', 30)
})()
