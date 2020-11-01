import uid from 'uid'
import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type AType = 'number'

// AST
type ASymbol = string
type AFuncall = [string, AST, AST]

type AFunction = (a: number, b: number) => Promise<number> | number

interface AGraph {
	values: {[sym: string]: AST}
	return: AST
}

type AST = number | ASymbol | AFuncall | AGraph

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
const Functions = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
	'*': (a, b) => a * b,
	'/': (a, b) => a / b,
} as {[s: string]: AFunction}

// PDG

interface PDGFncall {
	id: string
	type: 'fncall'
	fn: AFunction
	name: string
	params: PDG[]
	evaluated?: number | Promise<number>
}

interface PDGGraph {
	id: string
	type: 'graph'
	values: {[sym: string]: PDG}
	return: PDG
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
		if (typeof ast === 'string') {
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
		} else if (Array.isArray(ast)) {
			// Function Call
			const [fn, left, right] = ast
			if (!(fn in Functions)) {
				throw new Error(`Undefined function: ${fn}`)
			}
			return {
				id: uid(),
				type: 'fncall',
				fn: Functions[fn],
				name: fn,
				params: [traverse(left, env), traverse(right, env)],
			}
		} else if (ast instanceof Object) {
			// Graph
			// Create new env
			const innerEnv = new Env(ast, env)

			const values = Object.fromEntries(
				Object.entries(ast.values).map(([s, a]) => {
					const v = innerEnv.get(s)
					if (!v) throw new Error('ERROR')
					if (v.isPDG) return [s, v.pdg]

					v.resolving = true
					const pdg = traverse(a, innerEnv)

					innerEnv.swap(s, {isPDG: true, pdg})

					return [s, pdg]
				})
			)

			// Generate PDG of return expression
			return {
				id: uid(),
				type: 'graph',
				values,
				return: traverse(ast.return, innerEnv),
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

		pdg.evaluated = Promise.all([
			evalPDG(pdg.params[0]),
			evalPDG(pdg.params[1]),
		]).then(([a, b]) => pdg.fn(a, b))

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

;(async function () {
	await test('(+ 1 2)', 3)
	await test('(+ 1 (+ 2 3))', 6)
	await test('{a (+ 1 2) a}', 3)
	await test('{a a 10}', 'error')
	await test('{a 10 b {a 20 a} (+ a b)}', 30)
})()
