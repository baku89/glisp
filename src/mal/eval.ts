/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	createMalFunc,
	isMalFunc,
	MalFuncThis,
	MalError,
	symbolFor as S,
	isSymbol,
	M_ISMACRO,
	M_EVAL,
	M_FN,
	isMap,
	MalMap,
	isList,
	createList as L,
	MalNode,
	isNode,
	MalSeq,
	M_EVAL_PARAMS,
	M_PARAMS,
	MalBind,
	isSeq,
	isVector,
	setExpandInfo,
	ExpandType,
	getType,
	isSymbolFor
} from './types'
import Env from './env'
import {saveOuter} from './reader'
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
const S_UNQUOTE = S('unquote')
const S_QUASIQUOTE = S('quasiquote')
const S_SPLICE_UNQUOTE = S('splice-unquote')
const S_TRY = S('try')
const S_CATCH = S('catch')
const S_CONCAT = S('concat')
const S_ENV_CHAIN = S('env-chain')
const S_EVAL_IN_ENV = S('eval*')
const S_VAR = S('var')
const S_LST = S('lst')

// eval

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
		;(exp as MalSeq)[M_FN] = fn

		const params = exp.slice(1)
		if (cache) {
			;(exp as MalSeq)[M_EVAL_PARAMS] = params
		}
		exp = fn.bind({callerEnv: Env})(...params)
	}

	if (cache && exp !== _exp && isList(_exp)) {
		setExpandInfo(_exp, {type: ExpandType.Constant, exp})
	}

	return exp
}

function evalAtom(exp: MalVal, env: Env, cache: boolean) {
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
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const ret = evalExp(x, env, cache)
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
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const ret = evalExp(exp[k], env, cache)
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
			return evalAtom(exp, env, cache)
		}

		// Expand macro
		exp = macroexpand(exp, env, cache)

		if (!isList(exp)) {
			return evalAtom(exp, env, cache)
		}

		if (exp.length === 0) {
			return null
		}

		// Apply list
		const [first] = exp

		if (!isSymbol(first)) {
			throw new MalError(
				`${capital(getType(first))} ${printExp(
					first
				)} is not a function. First element of list always should be a function.`
			)
		}

		switch (first.value) {
			case 'def': {
				if (cache) {
					exp[M_FN] = env.get(S_DEF) as MalFunc
				}
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = env.set(sym, evalExp(form, env, cache))
				if (cache) {
					setExpandInfo(exp, {
						type: ExpandType.Unchange
					})
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'defvar': {
				if (cache) {
					exp[M_FN] = env.get(S_DEFVAR) as MalFunc
				}
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of defvar')
				}
				const ret = evalExp(form, env, cache)
				env.set(sym, ret, exp)
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'let': {
				if (cache) {
					exp[M_FN] = env.get(S_LET) as MalFunc
				}
				const letEnv = new Env(env)
				const [, binds, ...body] = exp
				if (!isVector(binds)) {
					throw new MalError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], letEnv, cache) as MalVal[]
					)
				}
				env = letEnv
				const ret = body.length === 1 ? body[0] : L(S_DO, ...body)
				if (cache) {
					setExpandInfo(exp, {
						type: ExpandType.Env,
						exp: ret,
						env: letEnv
					})
				}
				exp = ret
				break // continue TCO loop
			}
			case 'binding': {
				if (cache) {
					exp[M_FN] = env.get(S_BINDING) as MalFunc
				}
				const bindingEnv = new Env()
				const [, binds, ..._body] = exp
				if (!isSeq(binds)) {
					throw new MalError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.length; i += 2) {
					bindingEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], env, cache) as MalVal[]
					)
				}
				env.pushBinding(bindingEnv)
				const body = _body.length === 1 ? _body[0] : L(S_DO, ..._body)
				let ret
				try {
					ret = evalExp(body, env, cache)
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
					exp[M_FN] = env.get(S_GET_ALL_SYMBOLS) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'fn-params': {
				if (cache) {
					exp[M_FN] = env.get(S_FN_PARAMS) as MalFunc
				}
				const fn = evalExp(exp[1], env, cache)
				const ret = isMalFunc(fn) ? [...fn[M_PARAMS]] : null
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'eval*': {
				if (cache) {
					exp[M_FN] = env.get(S_EVAL_IN_ENV) as MalFunc
				}
				const expanded = evalExp(exp[1], env, cache)
				exp = evalExp(expanded, this ? this.callerEnv : env, cache)
				break // continue TCO loop
			}
			case 'quote': {
				const ret = exp[1]
				if (cache) {
					exp[M_FN] = env.get(S_QUOTE) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'quasiquote': {
				if (cache) {
					exp[M_FN] = env.get(S_QUASIQUOTE) as MalFunc
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
					(...args) =>
						evalExp(body, new Env(env, params as any[], args), cache),
					body,
					env,
					params as MalBind
				)
				if (cache) {
					exp[M_FN] = env.get(S_FN) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'fn-sugar': {
				if (cache) {
					exp[M_FN] = env.get(S_FN_SUGAR) as MalFunc
				}
				const body = exp[1]
				const ret = createMalFunc(
					(...args) => evalExp(body, new Env(env, [], args), cache),
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
					exp[M_FN] = env.get(S_MACRO) as MalFunc
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
					(...args) =>
						evalExp.bind(this)(
							body,
							new Env(env, params as any[], args),
							cache
						),
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
					exp[M_FN] = env.get(S_MACROEXPAND) as MalFunc
				}
				const ret = macroexpand(exp[1], env, cache)
				if (cache) {
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case 'try': {
				if (cache) {
					exp[M_FN] = env.get(S_TRY) as MalFunc
				}
				const [, testExp, catchExp] = exp
				try {
					const ret = evalExp(testExp, env, cache)
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
							catchExp[M_FN] = env.get(S_CATCH) as MalFunc
						}
						if (exc instanceof Error) {
							err = exc.message
						}
						const [, errSym, errBody] = catchExp
						const ret = evalExp(errBody, new Env(env, [errSym], [err]), cache)
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
					exp[M_FN] = env.get(S_DO) as MalFunc
				}
				if (exp.length === 1) {
					return null
				}
				evalAtom(exp.slice(1, -1), env, cache)
				const ret = exp[exp.length - 1]
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				if (cache) {
					exp[M_FN] = env.get(S_IF) as MalFunc
				}
				const [, _test, thenExp, elseExp] = exp
				const test = evalExp(_test, env, cache)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				exp = ret
				break // continue TCO loop
			}
			// case S_ENV_CHAIN: {
			// 	if (cache) {
			// 		exp[M_FN] = env.get(S_ENV_CHAIN) as MalFunc
			// 	}
			// 	const envs = env.getChain()
			// 	exp = L(S('println'), envs.map(e => e.name).join(' <- '))
			// 	break // continue TCO loop
			// }
			// case 'which-env': {
			// 	let _env: Env | null = env
			// 	const envs = []

			// 	do {
			// 		envs.push(_env)
			// 		_env = _env.outer
			// 	} while (_env)

			// 	exp = [
			// 		S('println'),
			// 		envs
			// 			.filter(e => e.hasOwn(a1 as MalSymbol))
			// 			.map(e => e.name)
			// 			.join(' <- ') || 'not defined'
			// 	]
			// 	break
			// }
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = evalAtom(exp, env, cache) as MalVal[]

				if (fn instanceof Function) {
					if (cache) {
						exp[M_EVAL_PARAMS] = params
						exp[M_FN] = fn
					}

					const ret = fn(...params)

					if (cache) {
						origExp[M_EVAL] = ret
					}

					return ret
				}
			}
		}
	}

	throw new Error('Exceed the maximum TCO stacks')
}
