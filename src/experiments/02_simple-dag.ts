// AST
type AAtom = number | string
type AFuncall = [string, AST, AST]

interface AGraph {
	[s: string]: AST
	$return: AST
}

type AST = AAtom | AFuncall | AGraph

// Env
interface Env {
	[s: string]:
		| {isPDG: true; pdg: PDG}
		| {isPDG: false; seeking: boolean; ast: AST}
}

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
	return seek(ast, null)

	function seek(ast: AST, env: Env | null): PDG {
		if (typeof ast === 'number') {
			// Number
			return {
				type: 'leaf',
				value: ast,
			}
		} else if (typeof ast === 'string') {
			// Symbol
			if (!env || !(ast in env)) {
				throw new Error(`Undeclared identifier: ${ast}`)
			}
			const v = env[ast]
			if (v.isPDG) {
				return v.pdg
			} else {
				if (v.seeking) {
					throw new Error(`Circular reference: ${ast}`)
				}
				v.seeking = true
				const pdg = seek(v.ast, env)
				v.seeking = false
				env[ast] = {
					isPDG: true,
					pdg,
				}
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
			const _env = Object.fromEntries(
				Object.entries(ast)
					.filter(([k]) => !k.startsWith('$'))
					.map(([sym, ast]) => [sym, {isPDG: false, seeking: false, ast}])
			) as Env

			// Generate PDG of return expression
			return seek(ast.$return, _env)
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
	a: ['-', 'b', ['+', 1, 2]],
	b: {
		a: ['+', 20, {$return: 10}],
		$return: 'a',
	},
	$return: ['+', 'a', 'a'],
})
