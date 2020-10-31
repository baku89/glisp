import peg from 'pegjs'
import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type AType = 'number'

// AST
type AValue = number
type ASymbol = symbol
type AAtom = AValue | ASymbol
type AFuncall = [symbol, AST, AST]

type AFunction = (a: AValue, b: AValue) => Promise<AValue> | AValue

interface AGraph {
	values: Map<symbol, AST>
	return: AST
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

	private data!: Map<symbol, EnvData>

	constructor(graph?: AGraph, outer?: Env) {
		this.outer = outer
		this.data = new Map()

		if (graph) {
			for (const [s, ast] of graph.values.entries()) {
				this.data.set(s, {
					isPDG: false,
					seeking: false,
					ast,
				})
			}
		}
	}

	get(s: symbol): EnvData | undefined {
		return this.data.get(s) ?? this.outer?.get(s)
	}

	swap(s: symbol, data: EnvData) {
		if (this.data.has(s)) {
			this.data.set(s, data)
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
		if (typeof ast === 'symbol') {
			// Symbol
			const v = env.get(ast)
			if (!v) throw new Error(`Undefined identifer: ${Symbol.keyFor(ast)}`)

			if (v.isPDG === true) {
				return v.pdg
			}

			if (v.seeking) {
				throw new Error(`Circular reference: ${Symbol.keyFor(ast)}`)
			}
			v.seeking = true
			const pdg = seek(v.ast, env)
			v.seeking = false

			env.swap(ast, {isPDG: true, pdg})

			return pdg
		} else if (Array.isArray(ast)) {
			// Function Call
			const [fn, left, right] = ast
			const fnKey = Symbol.keyFor(fn) ?? ''
			if (!(fnKey in Functions)) {
				throw new Error(`Undefined function: ${Symbol.keyFor(fn)}`)
			}
			return {
				type: 'node',
				fn: Functions[fnKey],
				symbol: fnKey,
				left: seek(left, env),
				right: seek(right, env),
				evaluated: null,
			}
		} else if (ast instanceof Object) {
			// Graph
			// Create new env
			const innerEnv = new Env(ast, env)

			ast.values.forEach((a, s) => {
				const v = innerEnv.get(s)
				if (!v) throw new Error('ERROR')

				if (v.isPDG) return

				v.seeking = true
				seek(a, innerEnv)
				v.seeking = false
			})

			// Generate PDG of return expression
			return seek(ast.return, innerEnv)
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
