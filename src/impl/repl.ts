/* eslint-disable @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	MalList,
	isList,
	createMalFunc,
	isMalFunc,
	cloneAST
} from './types'

import readStr from './reader'
import printExp from './printer'
import Env from './env'
import {coreNS} from './core'

// read
export const READ = (str: string) => readStr(str)

// eval
const isPair = (x: MalVal) => Array.isArray(x) && x.length > 0

function quasiquote(ast: MalVal): MalVal {
	const _ast = ast as any

	if (!isPair(ast)) {
		return [Symbol.for('quote'), ast]
	} else if (_ast[0] === Symbol.for('unquote')) {
		return _ast[1]
	} else if (isPair(_ast[0]) && _ast[0][0] === Symbol.for('splice-unquote')) {
		return [Symbol.for('concat'), _ast[0][1], quasiquote(_ast.slice(1))]
	} else {
		return [Symbol.for('cons'), quasiquote(_ast[0]), quasiquote(_ast.slice(1))]
	}
}

function macroexpand(ast: MalVal = null, env: Env) {
	let _ast = ast as MalList

	while (isList(_ast) && typeof _ast[0] === 'symbol' && env.find(_ast[0])) {
		const fn = env.get(_ast[0]) as MalFunc
		if (!fn.ismacro) {
			break
		}
		_ast = fn(..._ast.slice(1)) as MalList
	}

	return _ast
}

const evalAst = (ast: MalVal, env: Env) => {
	if (typeof ast === 'symbol') {
		return env.get(ast)
	} else if (isList(ast)) {
		return (ast as MalList).map(x => EVAL(x, env))
	} else {
		return ast
	}
}

export function EVAL(ast: MalVal, env: Env): MalVal {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!isList(ast)) {
			return evalAst(ast, env)
		}

		ast = macroexpand(ast, env)

		if (!isList(ast)) {
			return evalAst(ast, env)
		}

		ast = ast as MalList
		if (ast.length === 0) {
			return ast
		}

		// Apply list
		const [a0, a1, a2, a3] = ast

		// Special Forms
		switch (typeof a0 === 'symbol' ? Symbol.keyFor(a0) : Symbol(':default')) {
			case 'def!':
				return env.set(a1 as symbol, EVAL(a2, env))
			case 'let': {
				const letEnv = new Env(env)
				const lst = a1 as MalList
				for (let i = 0; i < lst.length; i += 2) {
					letEnv.set(lst[i] as symbol, EVAL(lst[i + 1], letEnv))
				}
				env = letEnv
				ast = a2
				break // continue TCO loop
			}
			case 'quote':
				return a1
			case 'quasiquote':
				ast = quasiquote(a1)
				break // continue TCO loop
			case 'defmacro!': {
				const fn = cloneAST(EVAL(a2, env)) as MalFunc
				fn.ismacro = true
				return env.set(a1 as symbol, fn)
			}
			case 'macroexpand':
				return macroexpand(a1, env)
			case 'do':
				evalAst(ast.slice(1, -1), env)
				ast = ast[ast.length - 1]
				break // continue TCO loop
			case 'if': {
				const cond = EVAL(a1, env)
				if (cond) {
					ast = a2
				} else {
					ast = typeof a3 !== 'undefined' ? a3 : null
				}
				break // continue TCO loop
			}
			case 'fn':
				return createMalFunc(
					(...args) => EVAL(a2, new Env(env, a1 as symbol[], args)),
					a2,
					env,
					a1 as symbol[]
				)
			default: {
				// Apply Function
				const [_fn, ...args] = evalAst(ast, env) as MalList

				const fn = _fn as MalFunc

				if (isMalFunc(fn)) {
					env = new Env(fn.env, fn.params, args)
					ast = fn.ast
					break // continue TCO loop
				} else if (typeof fn === 'function') {
					return fn(...args)
				} else {
					throw new Error(`${fn} is not a function.`)
				}
			}
		}
	}
}

// print
export const PRINT = (ast: MalVal) => {
	return printExp(ast, true)
}

// rep
export const replEnv: Env = new Env()

export const REP = (str: string, env: Env = replEnv) =>
	PRINT(EVAL(READ(str), env))

// Setup REP env
coreNS.forEach((v, k) => replEnv.set(k, v))
replEnv.set('eval', (ast: MalVal) => {
	return EVAL(ast, replEnv)
})

REP(
	'(def! load-file (fn (f) (eval (read-string (str "(do " (slurp f) "\nnil)")))))'
)
REP('(load-file "./lib/index.mal")')
