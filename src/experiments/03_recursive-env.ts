// AST
type AAtom = number | string
type AFuncall = [string, AST, AST]

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

// interface Env {
// 	[$outer]: Env | null

// Functions
const Functions = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
} as {[s: string]: (a: number, b: number) => number}

// PDG
interface PDGLeaf {
	type: 'leaf'
	value: number
}

interface PDGNode {
	type: 'node'
	op: (a: number, b: number) => number
	left: PDG
	right: PDG
	evaluated: number | null
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
			if (!v) {
				throw new Error(`Undefined identifer: ${ast}`)
			}
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

function evalPDG(pdg: PDG): number {
	if (pdg.type === 'leaf') {
		return pdg.value
	} else {
		if (pdg.evaluated) {
			return pdg.evaluated
		}

		const result = pdg.op(evalPDG(pdg.left), evalPDG(pdg.right))
		pdg.evaluated = result
		return result
	}
}

function rep(ast: AST) {
	const pdg = generatePDG(ast)
	console.log('pdg=', pdg)
	const ret = evalPDG(pdg)
	console.log('result=', ret)
}

rep({
	a: ['-', 0, {$return: 'a'}],
	$return: ['+', 'a', 'a'],
})
