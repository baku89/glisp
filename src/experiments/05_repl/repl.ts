import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type AType = 'number'

// AST
type AValue = number
type ASymbol = string
type AAtom = AValue | ASymbol
type AFuncall = [string, AST, AST]

type AFunction = (a: AValue, b: AValue) => Promise<AValue> | AValue

interface AGraph {
	[s: string]: AST
	$return: AST
}

type AST = AAtom | AFuncall | AGraph

// Env
interface EnvPDGData {
	isPDG: true
	pdg: PDG
}

interface EnvASTData {
	isPDG: false
	seeking: boolean
	ast: AST
}

type EnvData = EnvPDGData | EnvASTData

class Env {
	private outer?: Env

	private data!: {
		[s: string]: EnvData
	}

	constructor(graph?: AGraph, outer?: Env) {
		this.outer = outer
		this.data = {}

		if (graph) {
			for (const [s, ast] of Object.entries(graph)) {
				if (s === '$return') continue

				this.data[s] = {
					isPDG: false,
					seeking: false,
					ast: ast,
				}
			}
		}
	}

	get(s: string): EnvData | null {
		if (s in this.data) return this.data[s]
		if (this.outer) return this.outer.get(s)
		return null
	}

	swap(s: string, data: EnvData) {
		if (s in this.data) this.data[s] = data
		if (this.outer) this.outer.swap(s, data)
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
interface PDGLeaf {
	type: 'leaf'
	value: AValue
}
interface PDGNode {
	type: 'node'
	fn: AFunction
	symbol: string
	left: PDG
	right: PDG
	evaluated: AValue | Promise<AValue> | null
}

export type PDG = PDGLeaf | PDGNode

export function readStr(str: string): AST {
	return parser.parse(str)
}

export function generatePDG(ast: AST): PDG {
	return seek(ast, new Env())

	function seek(ast: AST, env: Env): PDG {
		if (typeof ast === 'string') {
			// Symbol
			const v = env.get(ast)
			if (!v) throw new Error(`Undefined identifer: ${ast}`)

			if (v.isPDG === true) {
				return v.pdg
			}

			if (v.seeking) {
				throw new Error(`Circular reference: ${ast}`)
			}
			v.seeking = true
			const pdg = seek(v.ast, env)
			v.seeking = false

			env.swap(ast, {isPDG: true, pdg})

			return pdg
		} else if (Array.isArray(ast)) {
			// Function Call
			const [fn, left, right] = ast
			if (!(fn in Functions)) {
				throw new Error(`Undefined function: ${fn}`)
			}
			return {
				type: 'node',
				fn: Functions[fn],
				symbol: fn,
				left: seek(left, env),
				right: seek(right, env),
				evaluated: null,
			}
		} else if (ast instanceof Object) {
			// Graph
			// Create new env
			const innerEnv = new Env(ast, env)

			Object.entries(ast)
				.filter(([s]) => s !== '$return')
				.forEach(([s, a]) => {
					if (s === '$return') return

					const v = innerEnv.get(s)
					if (!v) throw new Error('ERROR')

					if (v.isPDG) return

					v.seeking = true
					seek(a, innerEnv)
					v.seeking = false
				})

			// Generate PDG of return expression
			return seek(ast.$return, innerEnv)
		} else {
			// Value
			return {type: 'leaf', value: ast}
		}
	}
}

export async function evalPDG(pdg: PDG): Promise<AValue> {
	if (pdg.type === 'leaf') {
		return pdg.value
	} else {
		if (pdg.evaluated) {
			return await pdg.evaluated
		}

		pdg.evaluated = Promise.all([
			evalPDG(pdg.left),
			evalPDG(pdg.right),
		]).then(([a, b]) => pdg.fn(a, b))

		return await pdg.evaluated
	}
}

export async function rep(str: string) {
	const ast = readStr(str)
	const pdg = generatePDG(ast)
	const ret = await evalPDG(pdg)
	return ret.toString()
}
