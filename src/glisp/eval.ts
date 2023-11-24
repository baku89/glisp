/* eslint-ignore @typescript-eslint/no-use-before-define */

import {capital} from 'case'
import {mapValues} from 'lodash'

import {printExpr} from '.'
import Env from './env'
import {M_AST, M_ENV, M_EVAL, M_EXPAND, M_ISMACRO, M_PARAMS} from './symbols'
import {
	createFn,
	createList,
	createList as L,
	Expr,
	ExprBind,
	ExprFnThis,
	ExprMap,
	ExprVector,
	getType,
	GlispError,
	isExprFn,
	isFunc,
	isList,
	isMap,
	isSeq,
	isSymbol,
	isSymbolFor,
	isVector,
	symbolFor as S,
} from './types'

const S_DO = S('do')

function evalQuote(expr: Expr, env: Env): Expr {
	if (isMap(expr)) {
		return mapValues(expr, (v: Expr) => evalQuote(v, env)) as ExprMap
	}

	const isExpList = isList(expr)
	const isExprVector = isVector(expr)

	if (!isExpList && !isExprVector) {
		return expr
	}

	if (isSymbolFor(expr[0], 'unquote')) {
		return evaluate(expr[1], env)
	}

	const ret: ExprVector = expr.flatMap(e => {
		if (isList(e) && isSymbolFor(e[0], 'splice-unquote')) {
			return evaluate(e[1], env)
		} else {
			return [evalQuote(e, env)]
		}
	})

	return isExpList ? createList(...ret) : ret
}

function macroexpand(exp: Expr, env: Env) {
	const originalExp = exp

	while (isList(exp)) {
		const fst = evaluate(exp[0], env)
		if (!isExprFn(fst) || !fst[M_ISMACRO]) {
			break
		}

		exp = fst.apply({callerEnv: env}, exp.slice(1))
	}

	if (exp !== exp && isList(originalExp)) {
		originalExp[M_EXPAND] = {type: 'constant', exp: exp}
	}

	return exp
}

function evalAtom(this: void | ExprFnThis, exp: Expr, env: Env) {
	if (isSymbol(exp)) {
		return env.get(exp)
	} else if (Array.isArray(exp)) {
		const ret = exp.map(x => evaluate.call(this, x, env))
		return isList(exp) ? L(...ret) : ret
	} else if (isMap(exp)) {
		const hm: ExprMap = {}
		for (const k in exp) {
			const ret = evaluate.call(this, exp[k], env)
			hm[k] = ret
		}
		return hm
	} else {
		return exp
	}
}

/**
 * Non-memoized version of `evaluate`
 */
function _evaluate(this: void | ExprFnThis, expr: Expr, env: Env): Expr {
	let counter = 0
	while (counter++ < 1e6) {
		// Expand macro
		expr = macroexpand(expr, env)

		if (!isList(expr)) {
			return evalAtom.call(this, expr, env)
		}

		if (expr.length === 0) {
			return null
		}

		// Apply list
		const [first] = expr

		if (!isSymbol(first) && !isFunc(first)) {
			throw new GlispError(
				`${capital(getType(first))} ${printExpr(
					first
				)} is not a function. First element of list always should be a function.`
			)
		}

		switch (isSymbol(first) ? first.value : first) {
			case 'def': {
				const [, sym, form] = expr
				if (!isSymbol(sym) || form === undefined) {
					throw new GlispError('Invalid form of def')
				}
				expr[M_EXPAND] = {
					type: 'unchange',
				}
				return env.set(sym, evaluate.call(this, form, env))
			}
			case 'defvar': {
				const [, sym, form] = expr
				if (!isSymbol(sym) || form === undefined) {
					throw new GlispError('Invalid form of defvar')
				}
				expr[M_EXPAND] = {
					type: 'unchange',
				}
				return env.set(sym, evaluate.call(this, form, env))
			}
			case 'let': {
				const letEnv = new Env(env)
				const [, binds, ...body] = expr
				if (!isVector(binds)) {
					throw new GlispError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evaluate.call(this, binds[i + 1], letEnv) as Expr[]
					)
				}
				env = letEnv
				const ret = body.length === 1 ? body[0] : L(S_DO, ...body)
				expr[M_EXPAND] = {
					type: 'env',
					exp: ret,
					env: letEnv,
				}
				expr = ret
				break // continue TCO loop
			}
			case 'binding': {
				const bindingEnv = new Env(undefined, undefined, undefined, 'binding')
				const [, binds, ..._body] = expr
				if (!isSeq(binds)) {
					throw new GlispError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.length; i += 2) {
					bindingEnv.bindAll(
						binds[i] as any,
						evaluate.call(this, binds[i + 1], env) as Expr[]
					)
				}
				env.pushBinding(bindingEnv)
				const body = _body.length === 1 ? _body[0] : L(S_DO, ..._body)
				let ret
				try {
					ret = evaluate.call(this, body, env)
				} finally {
					env.popBinding()
				}
				return ret
			}
			case 'get-all-symbols': {
				return env.getAllSymbols()
			}
			case 'eval*': {
				if (!this) {
					throw new GlispError('Cannot find the caller env')
				}
				const expanded = evaluate.call(this, expr[1], env)
				expr = evaluate.call(this, expanded, this ? this.callerEnv : env)
				break // continue TCO loop
			}
			case 'quote': {
				return evalQuote(expr[1], env)
			}
			case '=>': {
				const [, , body] = expr
				let [, params] = expr
				if (isMap(params)) {
					params = [params]
				}
				if (!isVector(params)) {
					throw new GlispError('First argument of fn should be vector or map')
				}
				if (body === undefined) {
					throw new GlispError('Second argument of fn should be specified')
				}
				return createFn(
					function (...args) {
						return evaluate.call(
							this,
							body,
							new Env(env, params as ExprBind, args, 'fn')
						)
					},
					body,
					env,
					params as ExprBind
				)
			}
			case 'fn-sugar': {
				const body = expr[1]
				return createFn(
					function (...args) {
						return evaluate.call(this, body, new Env(env, [], args, 'fn-sugar'))
					},
					body,
					env,
					[]
				)
			}
			case 'macro': {
				const [, , body] = expr
				let [, params] = expr
				if (isMap(params)) {
					params = [params]
				}
				if (!isVector(params)) {
					throw new GlispError(
						'First argument of macro should be vector or map'
					)
				}
				if (body === undefined) {
					throw new GlispError('Second argument of macro should be specified')
				}
				const macro = createFn(
					function (...args) {
						return evaluate.call(
							this,
							body,
							new Env(env, params as ExprBind, args, 'macro')
						)
					},
					body,
					env,
					params as ExprBind,
					null,
					true
				)

				return macro
			}
			case 'macroexpand': {
				return macroexpand(expr[1], env)
			}
			case 'try': {
				const [, testExp, catchExp] = expr
				try {
					return evaluate.call(this, testExp, env)
				} catch (exc) {
					let err = exc
					if (
						isList(catchExp) &&
						isSymbolFor(catchExp[0], 'catch') &&
						isSymbol(catchExp[1])
					) {
						if (exc instanceof Error) {
							err = exc.message
						}
						const [, errSym, errBody] = catchExp
						return evaluate.call(
							this,
							errBody,
							new Env(env, [errSym], [err as any])
						)
					} else {
						throw err
					}
				}
			}
			case 'do': {
				if (expr.length === 1) {
					return null
				}
				evaluate.call(this, expr.slice(1, -1), env)
				const ret = expr[expr.length - 1]
				expr = ret
				break // continue TCO loop
			}
			case 'if': {
				const [, _test, thenExp, elseExp] = expr
				const test = evaluate.call(this, _test, env)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				expr = ret
				break // continue TCO loop
			}
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = expr.map(e => evaluate.call(this, e, env))

				if (fn instanceof Function) {
					if (isExprFn(fn)) {
						env = new Env(
							fn[M_ENV],
							fn[M_PARAMS],
							params,
							isSymbol(first) ? first.value : undefined
						)
						expr = fn[M_AST]
						// continue TCO loop
						break
					} else {
						return fn.apply({callerEnv: env}, params)
					}
				}
			}
		}
	}

	throw new Error('Exceed the maximum TCO stacks')
}

export function evaluate(this: void | ExprFnThis, expr: Expr, env: Env): Expr {
	if (typeof expr === 'object' && expr !== null) {
		if (M_EVAL in expr) {
			return expr[M_EVAL] as Expr
		} else {
			const evaluated = _evaluate.call(this, expr, env)
			;(expr as any)[M_EVAL] = evaluated
			return evaluated
		}
	}

	return _evaluate.call(this, expr, env)
}
