/* eslint-ignore @typescript-eslint/no-use-before-define */

import {capital} from 'case'

import Env from './env'
import {M_AST, M_ENV, M_EXPAND, M_ISMACRO, M_PARAMS} from './symbols'
import {
	createExprFn,
	createList as L,
	ExpandType,
	Expr,
	ExprBind,
	ExprFnThis,
	ExprMap,
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
const S_QUOTE = S('quote')
const S_CONCAT = S('concat')
const S_LST = S('lst')

function quasiquote(exp: Expr): Expr {
	if (isMap(exp)) {
		const ret: ExprMap = {}
		for (const [k, v] of Object.entries(exp)) {
			ret[k] = quasiquote(v)
		}
		return ret
	}

	if (!isPair(exp)) {
		return L(S_QUOTE, exp)
	}

	if (isSymbolFor(exp[0], 'unquote')) {
		return exp[1]
	}

	let ret = L(
		S_CONCAT,
		...exp.map(e => {
			if (isPair(e) && isSymbolFor(e[0], 'splice-unquote')) {
				return e[1]
			} else {
				return [quasiquote(e)]
			}
		})
	)
	ret = isList(exp) ? L(S_LST, ret) : ret
	return ret

	function isPair(x: Expr): x is Expr[] {
		return isSeq(x) && x.length > 0
	}
}

function macroexpand(_exp: Expr, env: Env) {
	let exp = _exp

	while (isList(exp) && isSymbol(exp[0]) && env.find(exp[0])) {
		const fn = env.get(exp[0])
		if (!isExprFn(fn) || !fn[M_ISMACRO]) {
			break
		}
		exp = fn.apply({callerEnv: env}, exp.slice(1))
	}

	if (exp !== _exp && isList(_exp)) {
		_exp[M_EXPAND] = {type: ExpandType.Constant, exp}
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

export function evaluate(this: void | ExprFnThis, exp: Expr, env: Env): Expr {
	let counter = 0
	while (counter++ < 1e6) {
		if (!isList(exp)) {
			return evalAtom.call(this, exp, env)
		}

		// Expand macro
		exp = macroexpand(exp, env)

		if (!isList(exp)) {
			return evalAtom.call(this, exp, env)
		}

		if (exp.length === 0) {
			return null
		}

		// Apply list
		const [first] = exp

		if (!isSymbol(first) && !isFunc(first)) {
			throw new GlispError(
				`${capital(getType(first))} ${printExpr(
					first
				)} is not a function. First element of list always should be a function.`
			)
		}

		switch (isSymbol(first) ? first.value : first) {
			case 'def': {
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new GlispError('Invalid form of def')
				}
				exp[M_EXPAND] = {
					type: ExpandType.Unchange,
				}
				return env.set(sym, evaluate.call(this, form, env))
			}
			case 'defvar': {
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new GlispError('Invalid form of defvar')
				}
				exp[M_EXPAND] = {
					type: ExpandType.Unchange,
				}
				return env.set(sym, evaluate.call(this, form, env))
			}
			case 'let': {
				const letEnv = new Env(env)
				const [, binds, ...body] = exp
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
				exp[M_EXPAND] = {
					type: ExpandType.Env,
					exp: ret,
					env: letEnv,
				}
				exp = ret
				break // continue TCO loop
			}
			case 'binding': {
				const bindingEnv = new Env(undefined, undefined, undefined, 'binding')
				const [, binds, ..._body] = exp
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
			case 'fn-params': {
				const fn = evaluate.call(this, exp[1], env)
				return isExprFn(fn) ? [...fn[M_PARAMS]] : null
			}
			case 'eval*': {
				// if (!this) {
				// 	throw new GlispError('Cannot find the caller env')
				// }
				const expanded = evaluate.call(this, exp[1], env)
				exp = evaluate.call(this, expanded, this ? this.callerEnv : env)
				break // continue TCO loop
			}
			case 'quote': {
				return exp[1]
			}
			case 'quasiquote': {
				return quasiquote(exp[1])
			}
			case 'fn': {
				const [, , body] = exp
				let [, params] = exp
				if (isMap(params)) {
					params = [params]
				}
				if (!isVector(params)) {
					throw new GlispError('First argument of fn should be vector or map')
				}
				if (body === undefined) {
					throw new GlispError('Second argument of fn should be specified')
				}
				return createExprFn(
					function (...args) {
						return evaluate.call(
							this,
							body,
							new Env(env, params as any[], args)
						)
					},
					body,
					env,
					params as ExprBind
				)
			}
			case 'fn-sugar': {
				const body = exp[1]
				return createExprFn(
					function (...args) {
						return evaluate.call(this, body, new Env(env, [], args))
					},
					body,
					env,
					[]
				)
			}
			case 'macro': {
				const [, , body] = exp
				let [, params] = exp
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
				return createExprFn(
					function (...args) {
						return evaluate.call(
							this,
							body,
							new Env(env, params as any[], args)
						)
					},
					body,
					env,
					params as ExprBind,
					null,
					true
				)
			}
			case 'macroexpand': {
				return macroexpand(exp[1], env)
			}
			case 'try': {
				const [, testExp, catchExp] = exp
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
				if (exp.length === 1) {
					return null
				}
				evaluate.call(this, exp.slice(1, -1), env)
				const ret = exp[exp.length - 1]
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				const [, _test, thenExp, elseExp] = exp
				const test = evaluate.call(this, _test, env)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				exp = ret
				break // continue TCO loop
			}
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = exp.map(e => evaluate.call(this, e, env))

				if (fn instanceof Function) {
					if (isExprFn(fn)) {
						env = new Env(
							fn[M_ENV],
							fn[M_PARAMS],
							params,
							isSymbol(first) ? first.value : undefined
						)
						exp = fn[M_AST]
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
