import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

// AST
type AAtom = number | string
type AFuncall = [string, AST, AST]

type AFunction = (a: number, b: number) => Promise<number> | number

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
				if (s.startsWith('$')) continue

				this.data[s] = {
					isPDG: false,
					seeking: false,
					ast: ast,
				}
			}
		}
	}

	get(s: string): EnvData | null {
		if (s in this.data) {
			return this.data[s]
		}

		if (this.outer) {
			return this.outer.get(s)
		}

		return null
	}

	set(s: string, data: EnvData) {
		this.data[s] = data
	}
}

// Functions
const Functions = {
	'+': (a, b) => {
		console.log('start adding', 'a=', a, 'b=', b)
		return a + b
	},
	'-': (a, b) => a - b,
	'*': (a, b) => a * b,
	'/': (a, b) => a / b,
} as {[s: string]: AFunction}

// PDG
interface PDGLeaf {
	type: 'leaf'
	value: number
}

interface PDGNode {
	type: 'node'
	op: AFunction
	left: PDG
	right: PDG
	evaluated: number | Promise<number> | null
}

type PDG = PDGLeaf | PDGNode

function generatePDG(ast: AST): PDG {
	return seek(ast, new Env())

	function seek(ast: AST, env: Env): PDG {
		if (typeof ast === 'number') {
			// Number
			return {
				type: 'leaf',
				value: ast,
			}
		} else if (typeof ast === 'string') {
			// Symbol
			const v = env.get(ast)
			if (!v) throw new Error(`Undefined identifer: ${ast}`)

			if (v.isPDG === true) {
				return v.pdg
			} else {
				if (v.seeking) {
					throw new Error(`Circular reference: ${ast}`)
				}
				v.seeking = true
				const pdg = seek(v.ast, env)
				v.seeking = false

				env?.set(ast, {isPDG: true, pdg})

				return pdg
			}
		} else if (Array.isArray(ast)) {
			// Function Call
			const [op, left, right] = ast
			if (!(op in Functions)) {
				throw new Error(`Undefined function: ${op}`)
			}
			return {
				type: 'node',
				op: Functions[op],
				left: seek(left, env),
				right: seek(right, env),
				evaluated: null,
			}
		} else {
			// Graph
			// Create new env
			const innerEnv = new Env(ast, env)
			// Generate PDG of return expression
			return seek(ast.$return, innerEnv)
		}
	}
}

async function evalPDG(pdg: PDG): Promise<number> {
	if (pdg.type === 'leaf') {
		return pdg.value
	} else {
		if (pdg.evaluated) {
			return pdg instanceof Promise ? await pdg.evaluated : pdg.evaluated
		}

		pdg.evaluated = Promise.all([
			evalPDG(pdg.left),
			evalPDG(pdg.right),
		]).then(([a, b]) => pdg.op(a, b))

		return await pdg.evaluated
	}
}

async function rep(str: string) {
	const ast: AST = parser.parse(str)
	console.log('ast=', ast)
	const pdg = generatePDG(ast)
	console.log('pdg=', pdg)
	const ret = await evalPDG(pdg)
	console.log('result=', ret)
}

rep(`
{
	100
}
`)
;(window as any).rep = rep
