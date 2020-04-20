/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	createMalFunc,
	isMalFunc,
	cloneAST,
	isKeyword,
	LispError,
	symbolFor as S,
	isSymbol
} from './types'
import Env from './env'
import printExp from './printer'

// eval
const isPair = (x: MalVal) => Array.isArray(x) && x.length > 0

function quasiquote(ast: any): MalVal {
	if (!isPair(ast)) {
		return [S('quote'), ast]
	} else if (ast[0] === S('unquote')) {
		return ast[1]
	} else if (isPair(ast[0]) && ast[0][0] === S('splice-unquote')) {
		return [S('concat'), ast[0][1], quasiquote(ast.slice(1))]
	} else {
		return [S('cons'), quasiquote(ast[0]), quasiquote(ast.slice(1))]
	}
}

function macroexpand(ast: MalVal = null, env: Env) {
	while (Array.isArray(ast) && isSymbol(ast[0]) && env.find(ast[0] as string)) {
		const fn = env.get(ast[0] as string) as MalFunc
		if (!fn.ismacro) {
			break
		}
		ast = fn(...ast.slice(1))
	}

	return ast
}

const evalAst = (ast: MalVal, env: Env) => {
	if (isSymbol(ast)) {
		return env.get(ast as string)
	} else if (Array.isArray(ast)) {
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		return ast.map(x => evalExp(x, env))
	} else if (ast instanceof Map) {
		const hm = new Map()
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		ast.forEach((v, k) => hm.set(evalExp(k, env), evalExp(v, env)))
		return hm
	} else {
		return ast
	}
}

export default function evalExp(ast: MalVal, env: Env): MalVal {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!Array.isArray(ast)) {
			return evalAst(ast, env)
		}

		ast = macroexpand(ast, env)

		if (!Array.isArray(ast)) {
			return evalAst(ast, env)
		}

		if (ast.length === 0) {
			return ast
		}

		// Apply list
		const [a0, a1, a2, a3] = ast

		// Special Forms
		switch (isSymbol(a0) ? (a0 as string).slice(1) : Symbol(':default')) {
			case 'def':
				return env.set(a1 as string, evalExp(a2, env))
			case 'let': {
				const letEnv = new Env(env)
				const lst = a1 as MalVal[]
				for (let i = 0; i < lst.length; i += 2) {
					letEnv.set(lst[i] as string, evalExp(lst[i + 1], letEnv))
				}
				env = letEnv
				ast = ast.length === 3 ? a2 : [S('do'), ...ast.slice(2)]
				break // continue TCO loop
			}
			case 'quote':
				return a1
			case 'quasiquote':
				ast = quasiquote(a1)
				break // continue TCO loop
			case 'defmacro': {
				const fnast = [
					S('fn'),
					a2,
					ast.length === 4 ? a3 : [S('do'), ...ast.slice(3)]
				]
				const fn = cloneAST(evalExp(fnast, env)) as MalFunc
				fn.ismacro = true
				return env.set(a1 as string, fn)
			}
			case 'macroexpand':
				return macroexpand(a1, env)
			case 'try':
				try {
					return evalExp(a1, env)
				} catch (exc) {
					let err = exc
					if (a2 && Array.isArray(a2) && a2[0] === S('catch')) {
						if (exc instanceof Error) {
							err = exc.message
						}
						return evalExp(a2[2], new Env(env, [a2[1] as string], [err]))
					} else {
						throw err
					}
				}
			case 'do':
				evalAst(ast.slice(1, -1), env)
				ast = ast[ast.length - 1]
				break // continue TCO loop
			case 'if': {
				const cond = evalExp(a1, env)
				if (cond) {
					ast = a2
				} else {
					ast = typeof a3 !== 'undefined' ? a3 : null
				}
				break // continue TCO loop
			}
			case 'fn':
				return createMalFunc(
					(...args) => evalExp(a2, new Env(env, a1 as string[], args)),
					a2,
					env,
					a1 as string[]
				)
			case 'env-chain': {
				let _env: Env | null = env
				const envs = []

				do {
					envs.push(_env)
					_env = _env.outer
				} while (_env)

				ast = [S('println'), envs.map(e => e.name).join(' <- ')]
				break // continue TCO loop
			}
			case 'which-env': {
				let _env: Env | null = env
				const envs = []

				do {
					envs.push(_env)
					_env = _env.outer
				} while (_env)

				ast = [
					S('println'),
					envs
						.filter(e => e.hasOwn(a1 as string))
						.map(e => e.name)
						.join(' <- ') || 'not defined'
				]
				break
			}
			default: {
				// Apply Function
				const [_fn, ...args] = evalAst(ast, env) as MalVal[]

				const fn = _fn as MalFunc

				if (isMalFunc(fn)) {
					env = new Env(fn.env, fn.params, args)
					ast = fn.ast
					break // continue TCO loop
				} else if (typeof fn === 'function') {
					return (fn as any)(...args)
				} else {
					let typename = ''

					if (isKeyword(fn)) {
						typename = 'Keyword '
					} else if (Array.isArray(fn)) {
						typename = 'List '
					}
					throw new LispError(
						`[EVAL] ${typename} ${printExp(
							fn
						)} is not a function. First element of list always should be a function.`
					)
				}
			}
		}
	}
}
