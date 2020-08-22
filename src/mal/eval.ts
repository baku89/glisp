/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	createMalFunc,
	isMalFunc,
	MalFuncThis,
	MalError,
	symbolFor as S,
	isSymbol,
	M_ISMACRO,
	M_EVAL,
	isMap,
	MalMap,
	isList,
	createList as L,
	MalNode,
	isNode,
	MalSeq,
	M_PARAMS,
	MalBind,
	isSeq,
	isVector,
	setExpandInfo,
	ExpandType,
	getType,
	isSymbolFor,
	M_AST,
	M_ENV,
	isFunc,
	MalSymbol,
} from './types'
import Env from './env'
import {printExp} from '.'
import {capital} from 'case'

const S_DEF = S('def')
const S_DEFVAR = S('defvar')
const S_LET = S('let')
const S_BINDING = S('binding')
const S_IF = S('if')
const S_DO = S('do')
const S_FN = S('fn')
const S_GET_ALL_SYMBOLS = S('get-all-symbols')
const S_FN_PARAMS = S('fn-params')
const S_FN_SUGAR = S('fn-sugar')
const S_MACRO = S('macro')
const S_MACROEXPAND = S('macroexpand')
const S_QUOTE = S('quote')
const S_QUASIQUOTE = S('quasiquote')
const S_TRY = S('try')
const S_CATCH = S('catch')
const S_CONCAT = S('concat')
const S_EVAL_IN_ENV = S('eval*')
const S_LST = S('lst')

function quasiquote(exp: MalVal): MalVal {
	if (isMap(exp)) {
		const ret: {[k: string]: MalVal} = {}
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

	function isPair(x: MalVal): x is MalVal[] {
		return isSeq(x) && x.length > 0
	}
}

function macroexpand(_exp: MalVal, env: Env, cache: boolean) {
	let exp = _exp

	while (isList(exp) && isSymbol(exp[0]) && env.find(exp[0])) {
		const fn = env.get(exp[0])
		if (!isMalFunc(fn) || !fn[M_ISMACRO]) {
			break
		}
		exp[0].evaluated = fn
		exp = fn.apply({callerEnv: env}, exp.slice(1))
	}

	if (cache && exp !== _exp && isList(_exp)) {
		setExpandInfo(_exp, {type: ExpandType.Constant, exp})
	}

	return exp
}

function evalAtom(
	this: void | MalFuncThis,
	exp: MalVal,
	env: Env,
	cache: boolean
) {
	if (isSymbol(exp)) {
		const ret = env.get(exp)
		if (cache) {
			const def = env.getDef(exp)
			if (def) {
				exp.def = def
			}
			exp.evaluated = ret
		}
		return ret
	} else if (Array.isArray(exp)) {
		const ret = exp.map(x => {
			const ret = evalExp.call(this, x, env, cache)
			if (cache && isNode(x)) {
				x[M_EVAL] = ret
			}
			return ret
		})
		if (cache) {
			;(exp as MalNode)[M_EVAL] = ret
		}
		return isList(exp) ? L(...ret) : ret
	} else if (isMap(exp)) {
		const hm: MalMap = {}
		for (const k in exp) {
			const ret = evalExp.call(this, exp[k], env, cache)
			if (cache && isNode(exp[k])) {
				;(exp[k] as MalNode)[M_EVAL] = ret
			}
			hm[k] = ret
		}
		if (cache) {
			;(exp as MalNode)[M_EVAL] = hm
		}
		return hm
	} else {
		return exp
	}
}

export default function evalExp(
	this: void | MalFuncThis,
	exp: MalVal,
	env: Env,
	cache = true
): MalVal {
	const origExp: MalSeq = exp as MalSeq

	let counter = 0
	while (counter++ < 1e6) {
		if (!isList(exp)) {
			const ret = evalAtom.call(this, exp, env, cache)
			if (cache && isNode(origExp)) {
				origExp[M_EVAL] = ret
			}
			return ret
		}

		// Expand macro
		exp = macroexpand(exp, env, cache)

		if (!isList(exp)) {
			const ret = evalAtom.call(this, exp, env, cache)
			if (cache && isNode(origExp)) {
				origExp[M_EVAL] = ret
			}
			return ret
		}

		if (exp.length === 0) {
			if (cache && isNode(origExp)) {
				origExp[M_EVAL] = null
			}
			return null
		}

		// Apply list
		const [first] = exp

		if (!isSymbol(first) && !isFunc(first)) {
			throw new MalError(
				`${capital(getType(first))} ${printExp(
					first
				)} is not a function. First element of list always should be a function.`
			)
		}

		switch (isSymbol(first) ? first.value : first) {
			case 'def': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_DEF)
				}
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = env.set(sym, evalExp.call(this, form, env, cache))
				if (cache) {
					setExpandInfo(exp, {
						type: ExpandType.Unchange,
					})
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'defvar': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_DEFVAR)
				}
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of defvar')
				}
				const ret = evalExp.call(this, form, env, cache)
				env.set(sym, ret, exp)
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'let': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_LET)
				}
				const letEnv = new Env(env)
				const [, binds, ...body] = exp
				if (!isVector(binds)) {
					throw new MalError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evalExp.call(this, binds[i + 1], letEnv, cache) as MalVal[]
					)
				}
				env = letEnv
				const ret = body.length === 1 ? body[0] : L(S_DO, ...body)
				if (cache) {
					setExpandInfo(exp, {
						type: ExpandType.Env,
						exp: ret,
						env: letEnv,
					})
				}
				exp = ret
				break // continue TCO loop
			}
			case 'binding': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_BINDING)
				}
				const bindingEnv = new Env(undefined, undefined, undefined, 'binding')
				const [, binds, ..._body] = exp
				if (!isSeq(binds)) {
					throw new MalError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.length; i += 2) {
					bindingEnv.bindAll(
						binds[i] as any,
						evalExp.call(this, binds[i + 1], env, cache) as MalVal[]
					)
				}
				env.pushBinding(bindingEnv)
				const body = _body.length === 1 ? _body[0] : L(S_DO, ..._body)
				let ret
				try {
					ret = evalExp.call(this, body, env, cache)
				} finally {
					env.popBinding()
				}
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'get-all-symbols': {
				const ret = env.getAllSymbols()
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_GET_ALL_SYMBOLS)
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'fn-params': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_FN_PARAMS)
				}
				const fn = evalExp.call(this, exp[1], env, cache)
				const ret = isMalFunc(fn) ? [...fn[M_PARAMS]] : null
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'eval*': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_EVAL_IN_ENV)
				}
				// if (!this) {
				// 	throw new MalError('Cannot find the caller env')
				// }
				const expanded = evalExp.call(this, exp[1], env, cache)
				exp = evalExp.call(this, expanded, this ? this.callerEnv : env, cache)
				break // continue TCO loop
			}
			case 'quote': {
				const ret = exp[1]
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_QUOTE)
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'quasiquote': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_QUASIQUOTE)
				}
				const ret = quasiquote(exp[1])
				exp = ret
				break // continue TCO loop
			}
			case 'fn': {
				const [, , body] = exp
				let [, params] = exp
				if (isMap(params)) {
					params = [params]
				}
				if (!isVector(params)) {
					throw new MalError('First argument of fn should be vector or map')
				}
				if (body === undefined) {
					throw new MalError('Second argument of fn should be specified')
				}
				const ret = createMalFunc(
					function (...args) {
						return evalExp.call(
							this,
							body,
							new Env(env, params as any[], args),
							cache
						)
					},
					body,
					env,
					params as MalBind
				)
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_FN)
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'fn-sugar': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_FN_SUGAR)
				}
				const body = exp[1]
				const ret = createMalFunc(
					function (...args) {
						return evalExp.call(this, body, new Env(env, [], args), cache)
					},
					body,
					env,
					[]
				)
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'macro': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_MACRO)
				}
				const [, , body] = exp
				let [, params] = exp
				if (isMap(params)) {
					params = [params]
				}
				if (!isVector(params)) {
					throw new MalError('First argument of macro should be vector or map')
				}
				if (body === undefined) {
					throw new MalError('Second argument of macro should be specified')
				}
				const ret = createMalFunc(
					function (...args) {
						return evalExp.call(
							this,
							body,
							new Env(env, params as any[], args),
							cache
						)
					},
					body,
					env,
					params as MalBind
				)
				ret[M_ISMACRO] = true
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'macroexpand': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_MACROEXPAND)
				}
				const ret = macroexpand(exp[1], env, cache)
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'try': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_TRY)
				}
				const [, testExp, catchExp] = exp
				try {
					const ret = evalExp.call(this, testExp, env, cache)
					if (cache) {
						origExp[M_EVAL] = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (
						isList(catchExp) &&
						isSymbolFor(catchExp[0], 'catch') &&
						isSymbol(catchExp[1])
					) {
						if (cache) {
							;(first as MalSymbol).evaluated = env.get(S_CATCH)
						}
						if (exc instanceof Error) {
							err = exc.message
						}
						const [, errSym, errBody] = catchExp
						const ret = evalExp.call(
							this,
							errBody,
							new Env(env, [errSym], [err]),
							cache
						)
						if (cache) {
							origExp[M_EVAL] = ret
						}
						return ret
					} else {
						throw err
					}
				}
			}
			case 'do': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_DO)
				}
				if (exp.length === 1) {
					if (cache && isNode(origExp)) {
						origExp[M_EVAL] = null
					}
					return null
				}
				evalExp.call(this, exp.slice(1, -1), env, cache)
				const ret = exp[exp.length - 1]
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				if (cache) {
					;(first as MalSymbol).evaluated = env.get(S_IF)
				}
				const [, _test, thenExp, elseExp] = exp
				const test = evalExp.call(this, _test, env, cache)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				exp = ret
				break // continue TCO loop
			}
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = exp.map(e => evalExp.call(this, e, env, cache))

				if (fn instanceof Function) {
					if (cache) {
						;(first as MalSymbol).evaluated = fn
					}

					if (isMalFunc(fn)) {
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
						const ret = fn.apply({callerEnv: env}, params)
						if (cache) {
							origExp[M_EVAL] = ret
						}
						return ret
					}
				}
			}
		}
	}

	throw new Error('Exceed the maximum TCO stacks')
}
