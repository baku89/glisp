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

interface PDGFncall {
	type: 'fncall'
	name: string
	params: PDG[]
	fn?: AFunction
	invalid?: boolean
	evaluated?: Promise<number>
}

interface PDGGraph {
	type: 'graph'
	values: {[sym: string]: PDG}
	return: string
	ref?: PDG
}

interface PDGSymbol {
	type: 'symbol'
	name: string
	ref?: PDG
}

interface PDGValue {
	type: 'value'
	value: number
}

export type PDG = PDGFncall | PDGSymbol | PDGGraph | PDGValue

function isResolved(pdg: PDG) {
	if (pdg.type === 'value' || pdg.type === 'graph') {
		return true
	}

	if (pdg.type === 'fncall') {
		return !!pdg.fn && 'invalid' in pdg
	} else {
		// Symbol
		return !!pdg.ref
	}
}

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
			if (pdg.fn && 'invalid' in pdg) return

			const {name, params} = pdg

			if (!(name in Functions)) {
				throw new Error(`Undefined function: ${name}`)
			}

			const {fn, paramCount} = Functions[name]

			// Parameter type checking
			pdg.fn = fn
			pdg.invalid = params.length !== paramCount

			pdg.params.forEach(p => traverse(p, env))
		} else if (pdg.type === 'graph') {
			// Graph

			// Check if resolved
			if (pdg.ref) return

			// Create new env
			const innerEnv = new Env(pdg.values, env)

			Object.entries(pdg.values).map(([s, p]) => {
				innerEnv.setResolving(s, true)
				traverse(p, innerEnv)
				innerEnv.setResolving(s, false)
			})

			// Resolve return symbol
			if (!(pdg.return in pdg.values)) {
				throw new Error(`Cannot resolve return symbol ${pdg.return}`)
			}

			pdg.ref = pdg.values[pdg.return]
		} else if (pdg.type === 'symbol') {
			// Symbol

			// Check if resolved
			if (pdg.ref) return

			if (env.isResolving(pdg.name)) {
				throw new Error(`Circular reference: ${pdg.name}`)
			}

			const ref = env.get(pdg.name)
			if (!ref) throw new Error(`Undefined identifer: ${pdg.name}`)

			pdg.ref = ref
		}
	}
}

export async function evalPDG(pdg: PDG): Promise<number> {
	if (pdg.type === 'value') {
		return pdg.value
	} else if (pdg.type === 'symbol') {
		if (!pdg.ref) {
			return Promise.reject(`Symbol ${pdg.ref} has not yet resolved`)
		}
		return evalPDG(pdg.ref)
	} else if (pdg.type === 'graph') {
		if (!pdg.ref) {
			return Promise.reject(`Return symbol ${pdg.ref} has not yet resolved`)
		}
		return evalPDG(pdg.ref)
	} else {
		if (pdg.evaluated) return await pdg.evaluated

		const {params, fn, invalid} = pdg

		if (invalid) {
			return Promise.reject('Invalid parameter')
		}

		if (!fn) {
			return Promise.reject(`Function ${pdg.name} has not yet resolved`)
		}

		pdg.evaluated = Promise.all(params.map(evalPDG)).then(ps => fn(...ps))

		return await pdg.evaluated
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
