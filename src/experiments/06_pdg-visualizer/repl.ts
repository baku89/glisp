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

interface PDGFncallBase {
	type: 'fncall'
	name: string
	params: PDG[]
}

interface PDGFncallResolved extends PDGFncallBase {
	fn: AFunction
	evaluated?: Promise<number>
}

interface PDGFncallError extends PDGFncallBase {
	error: string
}

type PDGFncall = PDGFncallBase | PDGFncallResolved | PDGFncallError

interface PDGGraphBase {
	type: 'graph'
	values: {[sym: string]: PDG}
	return: string
}

interface PDGGraphResolved extends PDGGraphBase {
	ref: PDG
}

interface PDGGraphError extends PDGGraphBase {
	error: string
}

type PDGGraph = PDGGraphBase | PDGGraphResolved | PDGGraphError

interface PDGSymbolBase {
	type: 'symbol'
	name: string
}

interface PDGSymbolResolved extends PDGSymbolBase {
	ref: PDG
}

interface PDGSymbolError extends PDGSymbolBase {
	error: string
}

type PDGSymbol = PDGSymbolBase | PDGSymbolResolved | PDGSymbolError

interface PDGValue {
	type: 'value'
	value: number
}

export async function getEvaluated(pdg: PDG): Promise<number | null> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if (pdg.type === 'symbol' || pdg.type === 'graph') {
		if ('error' in pdg || !('ref' in pdg)) {
			return null
		}

		return getEvaluated(pdg.ref)
	} else {
		// Fncall
		if ('error' in pdg || !('fn' in pdg) || !pdg.evaluated) {
			return null
		}

		return await pdg.evaluated
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
			if ('fn' in pdg || 'error' in pdg) return

			// Traverse children
			pdg.params.forEach(p => traverse(p, env))

			const {name, params} = pdg

			if (!(name in Functions)) {
				;(pdg as PDGFncallError).error = `Undefined function: ${name}`
				return
			}

			const {fn, paramCount} = Functions[name]

			if (params.length !== paramCount) {
				;(pdg as PDGFncallError).error = `Invalid parameter`
				return
			}

			;(pdg as PDGFncallResolved).fn = fn
		} else if (pdg.type === 'graph') {
			// Graph

			// Check if resolved
			if ('ref' in pdg || 'error' in pdg) return

			// Create new env
			const innerEnv = new Env(pdg.values, env)

			Object.entries(pdg.values).map(([s, p]) => {
				innerEnv.setResolving(s, true)
				traverse(p, innerEnv)
				innerEnv.setResolving(s, false)
			})

			// Resolve return symbol
			if (!(pdg.return in pdg.values)) {
				;(pdg as PDGGraphError).error = `Cannot resolve return symbol ${pdg.return}`
				return
			}

			;(pdg as PDGGraphResolved).ref = pdg.values[pdg.return]
		} else if (pdg.type === 'symbol') {
			// Symbol

			// Check if resolved
			if ('ref' in pdg || 'error' in pdg) return

			if (env.isResolving(pdg.name)) {
				;(pdg as PDGSymbolError).error = `Circular reference: ${pdg.name}`
				return
			}

			const ref = env.get(pdg.name)
			if (!ref) throw new Error(`Undefined identifer: ${pdg.name}`)
			;(pdg as PDGSymbolResolved).ref = ref
		}
	}
}

export async function evalPDG(pdg: PDG): Promise<number> {
	if (pdg.type === 'value') {
		return pdg.value
	}

	if ('error' in pdg) {
		return Promise.reject(pdg.error)
	}

	if (pdg.type === 'symbol') {
		if (!('ref' in pdg)) {
			return Promise.reject(`Symbol ${pdg.name} has not yet resolved`)
		}
		return evalPDG(pdg.ref)
	} else if (pdg.type === 'graph') {
		if (!('ref' in pdg)) {
			return Promise.reject(`Return symbol ${pdg.return} has not yet resolved`)
		}
		return evalPDG(pdg.ref)
	} else {
		if (!('fn' in pdg)) {
			return Promise.reject(`Function symbol ${pdg.name} has not yet resolved`)
		}

		if (pdg.evaluated) return await pdg.evaluated

		const {params, fn} = pdg

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
