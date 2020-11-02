import uid from 'uid'
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

interface EnvPDGData {
	isPDG: true
	pdg: PDG
}

interface EnvASTData {
	isPDG: false
	resolving: boolean
	ast: AST
}

type EnvData = EnvPDGData | EnvASTData

class Env {
	private outer?: Env

	private data!: {[name: string]: EnvData}

	constructor(graph?: AGraph, outer?: Env) {
		this.outer = outer
		this.data = {}

		if (graph) {
			for (const [s, ast] of Object.entries(graph.values)) {
				this.data[s] = {
					isPDG: false,
					resolving: false,
					ast,
				}
			}
		}
	}

	get(s: string): EnvData | undefined {
		return this.data[s] ?? this.outer?.get(s)
	}

	swap(s: string, data: EnvData) {
		if (this.data[s]) {
			this.data[s] = data
		} else if (this.outer) {
			this.outer.swap(s, data)
		}
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

interface PDGFncall {
	id: string
	type: 'fncall'
	fn: AFunction
	name: string
	params: PDG[]
	invalid?: boolean
	evaluated?: Promise<number>
}

interface PDGGraph {
	id: string
	type: 'graph'
	values: {[sym: string]: PDG}
	return: PDGSymbol
}

interface PDGSymbol {
	id: string
	type: 'symbol'
	name: string
	ref: PDG
}

interface PDGValue {
	id: string
	type: 'value'
	value: number
}

export type PDG = PDGFncall | PDGSymbol | PDGGraph | PDGValue

export function readStr(str: string): AST {
	return parser.parse(str)
}

export function analyzeAST(ast: AST): PDG {
	return traverse(ast, new Env())

	function traverse(ast: AST, env: Env): PDG {
		if (ast instanceof Object) {
			if (ast.type === 'fncall') {
				// Function Call
				const {fn: fnName, params} = ast

				if (!(fnName in Functions)) {
					throw new Error(`Undefined function: ${fnName}`)
				}

				const {fn, paramCount} = Functions[fnName]

				// Parameter type checking
				const invalid = params.length !== paramCount

				return {
					id: uid(),
					type: 'fncall',
					fn,
					name: fnName,
					params: params.map(p => traverse(p, env)),
					invalid,
				}
			} else {
				// Graph
				// Create new env
				const innerEnv = new Env(ast, env)

				const values = Object.fromEntries(
					Object.entries(ast.values).map(([s, a]) => {
						const v = innerEnv.get(s)
						if (!v) throw new Error(`BUG: Undefined identifier: ${s}`)
						if (v.isPDG) return [s, v.pdg]

						v.resolving = true
						const pdg = traverse(a, innerEnv)

						innerEnv.swap(s, {isPDG: true, pdg})

						return [s, pdg]
					})
				)

				// Resolve return symbol
				const r = innerEnv.get(ast.return)
				if (!r)
					throw new Error(
						`Undefined identifier in return expression: ${ast.return}`
					)
				if (!r.isPDG)
					throw new Error(`Cannot resolve return symbol ${ast.return}`)

				const ret: PDGSymbol = {
					id: uid(),
					type: 'symbol',
					name: ast.return,
					ref: r.pdg,
				}

				// Generate PDG of return expression
				return {
					id: uid(),
					type: 'graph',
					values,
					return: ret,
				}
			}
		} else if (typeof ast === 'string') {
			// Symbol
			const v = env.get(ast)
			if (!v) throw new Error(`Undefined identifer: ${ast}`)

			if (v.isPDG) {
				return {
					id: uid(),
					type: 'symbol',
					name: ast,
					ref: v.pdg,
				}
			}

			if (v.resolving) {
				throw new Error(`Circular reference: ${ast}`)
			}

			v.resolving = true
			const pdg = traverse(v.ast, env)

			env.swap(ast, {isPDG: true, pdg})

			return {
				id: uid(),
				type: 'symbol',
				name: ast,
				ref: pdg,
			}
		} else {
			// Value (number)
			return {
				id: uid(),
				type: 'value',
				value: ast,
			}
		}
	}
}

export async function evalPDG(pdg: PDG): Promise<number> {
	if (pdg.type === 'value') {
		return pdg.value
	} else if (pdg.type === 'symbol') {
		return evalPDG(pdg.ref)
	} else if (pdg.type === 'graph') {
		return evalPDG(pdg.return)
	} else {
		if (pdg.evaluated) return await pdg.evaluated

		const {params, fn, invalid} = pdg

		if (invalid) {
			return Promise.reject('Invalid parameter')
		}

		pdg.evaluated = Promise.all(params.map(evalPDG)).then(ps => fn(...ps))

		return await pdg.evaluated
	}
}

export async function rep(str: string) {
	const ast = readStr(str)
	const pdg = analyzeAST(ast)
	const ret = await evalPDG(pdg)
	return ret.toString()
}

// test code
async function test(str: string, expected: number | 'error') {
	let result: number
	try {
		result = await evalPDG(analyzeAST(readStr(str)))
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

// ;(async function () {
// 	await test('(+ 1 2)', 3)
// 	await test('(+ 1 (+ 2 3))', 6)
// 	await test('{a (+ 1 2) a}', 3)
// 	await test('{a a 10}', 'error')
// 	await test('{a 10 b {a 20 a} (+ a b)}', 30)
// })()
