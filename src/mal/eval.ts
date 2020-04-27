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
	isSymbol,
	M_ISMACRO,
	M_ENV,
	M_PARAMS,
	M_AST,
	M_EVAL,
	M_FN,
	isMap,
	MalMap,
	isList,
	isVector,
	markMalVector
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

function macroexpand(ast: MalVal = null, env: Env, saveEval: boolean) {
	while (isList(ast) && isSymbol(ast[0]) && env.find(ast[0] as string)) {
		const fn = env.get(ast[0] as string) as MalFunc
		;(ast as any)[M_FN] = fn
		if (!fn[M_ISMACRO]) {
			break
		}
		ast = fn(...ast.slice(1))
		if (saveEval) {
			;(ast as any)[M_FN] = fn
		}
	}
	return ast
}

const evalAst = (ast: MalVal, env: Env, saveEval: boolean) => {
	if (isSymbol(ast)) {
		return env.get(ast as string)
	} else if (Array.isArray(ast)) {
		const ret = ast.map(x => {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const ret = evalExp(x, env, saveEval)
			if (saveEval && isList(x)) {
				;(x as any)[M_EVAL] = ret
			}
			return ret
		})
		return isVector(ast) ? markMalVector(ret) : ret
	} else if (isMap(ast)) {
		const hm: MalMap = {}
		for (const k in ast) {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			hm[k] = evalExp(ast[k], env, saveEval)
		}
		return hm
	} else {
		return ast
	}
}

export default function evalExp(
	ast: MalVal,
	env: Env,
	saveEval = false
): MalVal {
	const _ev = saveEval

	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!isList(ast)) {
			return evalAst(ast, env, _ev)
		}

		ast = macroexpand(ast, env, _ev)

		if (!isList(ast)) {
			return evalAst(ast, env, _ev)
		}

		if (ast.length === 0) {
			return ast
		}

		// Apply list
		const [a0, a1, a2, a3] = ast

		// Special Forms
		switch (isSymbol(a0) ? (a0 as string).slice(1) : Symbol(':default')) {
			case 'def': {
				const ret = env.set(a1 as string, evalExp(a2, env, _ev))
				if (_ev) {
					;(ast as any)[M_FN] = env.get(S('def'))
					;(ast as any)[M_EVAL] = ret
				}
				return ret
			}
			case 'let': {
				const letEnv = new Env(env)
				const binds = a1 as MalVal[]
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.set(binds[i] as string, evalExp(binds[i + 1], letEnv, _ev))
				}
				env = letEnv
				const ret = ast.length === 3 ? a2 : [S('do'), ...ast.slice(2)]
				if (_ev) {
					;(ast as any)[M_EVAL] = ret
				}
				ast = ret
				break // continue TCO loop
			}
			case 'quote':
				if (_ev) {
					;(ast as any)[M_EVAL] = a1
				}
				return a1
			case 'quasiquote': {
				const ret = quasiquote(a1)
				if (_ev) {
					;(ast as any)[M_EVAL] = ret
				}
				ast = ret
				break // continue TCO loop
			}
			case 'defmacro': {
				const fnast = [
					S('fn'),
					a2,
					ast.length === 4 ? a3 : [S('do'), ...ast.slice(3)]
				]
				const fn = cloneAST(evalExp(fnast, env, _ev)) as MalFunc
				fn[M_ISMACRO] = true
				return env.set(a1 as string, fn)
			}
			case 'macroexpand':
				return macroexpand(a1, env, _ev)
			case 'try':
				try {
					return evalExp(a1, env, _ev)
				} catch (exc) {
					let err = exc
					if (a2 && Array.isArray(a2) && a2[0] === S('catch')) {
						if (exc instanceof Error) {
							err = exc.message
						}
						return evalExp(a2[2], new Env(env, [a2[1] as string], [err]), _ev)
					} else {
						throw err
					}
				}
			case 'do': {
				evalAst(ast.slice(1, -1), env, _ev)
				const ret = ast[ast.length - 1]
				if (_ev) {
					;(ast as any)[M_EVAL] = ret
				}
				ast = ret
				break // continue TCO loop
			}
			case 'if': {
				const cond = evalExp(a1, env, _ev)
				if (cond) {
					if (_ev) {
						;(ast as any)[M_EVAL] = a2
					}
					ast = a2
				} else {
					if (_ev) {
						;(ast as any)[M_EVAL] = a3
					}
					ast = typeof a3 !== 'undefined' ? a3 : null
				}
				break // continue TCO loop
			}
			case 'fn':
				return createMalFunc(
					(...args) => evalExp(a2, new Env(env, a1 as string[], args), _ev),
					a2,
					env,
					a1 as string[]
				)
			/*
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
			}*/
			default: {
				// Apply Function
				const [_fn, ...args] = evalAst(ast, env, saveEval) as MalVal[]

				const fn = _fn as MalFunc

				if (isMalFunc(fn)) {
					env = new Env(fn[M_ENV], fn[M_PARAMS], args)
					if (saveEval) {
						;(ast as any)[M_EVAL] = fn[M_AST]
						;(ast as any)[M_FN] = fn
					}
					ast = fn[M_AST]
					break // continue TCO loop
				} else if (typeof fn === 'function') {
					const ret = (fn as any)(...args)
					if (saveEval) {
						;(ast as any)[M_EVAL] = ret
						;(ast as any)[M_FN] = fn
					}
					return ret
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
