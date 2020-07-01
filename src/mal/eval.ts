/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	createMalFunc,
	isMalFunc,
	MalFuncThis,
	isKeyword,
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
	isMalNode,
	MalNodeSeq,
	M_OUTER,
	M_OUTER_INDEX,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL_PARAMS,
	keywordFor as K,
	M_PARAMS,
	MalBind,
	isSeq,
	isVector,
	setExpandInfo,
	ExpandType,
	getType
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
const S_EVAL_IN_ENV = S('eval-in-env')
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

	if (exp[0] === S_UNQUOTE) {
		return exp[1]
	}

	let ret = L(
		S_CONCAT,
		...exp.map(e => {
			if (isPair(e) && e[0] === S_SPLICE_UNQUOTE) {
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
		;(exp as MalNodeSeq)[M_FN] = fn

		const params = exp.slice(1)
		if (cache) {
			;(exp as MalNodeSeq)[M_EVAL_PARAMS] = params
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
			if (cache && isMalNode(x)) {
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
			if (cache && isMalNode(exp[k])) {
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
	const origExp: MalNodeSeq = exp as MalNodeSeq

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
			throw new MalError('Invalid empty list')
		}

		// Apply list
		const [first] = exp

		switch (first) {
			case S_DEF: {
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = env.set(sym, evalExp(form, env, cache))
				if (cache) {
					exp[M_FN] = env.get(S_DEF) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_DEFVAR: {
				const [, sym, form] = exp
				if (!isSymbol(sym) || form === undefined) {
					throw new MalError('Invalid form of defvar')
				}
				const ret = evalExp(form, env, cache)
				env.set(sym, ret, exp)
				if (cache) {
					exp[M_FN] = env.get(S_DEFVAR) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_LET: {
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
					exp[M_FN] = env.get(S_LET) as MalFunc
				}
				exp = ret
				break // continue TCO loop
			}
			case S_BINDING: {
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
					exp[M_FN] = env.get(S_BINDING) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_GET_ALL_SYMBOLS: {
				const ret = env.getAllSymbols()
				if (cache) {
					exp[M_FN] = env.get(S_GET_ALL_SYMBOLS) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_FN_PARAMS: {
				const fn = evalExp(exp[1], env, cache)
				const ret = isMalFunc(fn) ? L(...fn[M_PARAMS]) : null
				if (cache) {
					exp[M_FN] = env.get(S_FN_PARAMS) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_EVAL_IN_ENV: {
				const expanded = evalExp(exp[1], env, cache)
				if (cache) {
					exp[M_FN] = env.get(S_EVAL_IN_ENV) as MalFunc
				}
				exp = evalExp(expanded, this ? this.callerEnv : env, cache)
				break // continue TCO loop
			}
			case S_QUOTE: {
				const ret = exp[1]
				if (cache) {
					exp[M_FN] = env.get(S_QUOTE) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_QUASIQUOTE: {
				const ret = quasiquote(exp[1])
				if (cache) {
					exp[M_FN] = env.get(S_QUASIQUOTE) as MalFunc
				}
				exp = ret
				break // continue TCO loop
			}
			case S_FN: {
				const [, params, body] = exp
				if (!isVector(params)) {
					throw new MalError('First argument of fn should be vector')
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
			case S_FN_SUGAR: {
				const body = exp[1]
				const ret = createMalFunc(
					(...args) => evalExp(body, new Env(env, [], args), cache),
					body,
					env,
					[]
				)
				if (cache) {
					exp[M_FN] = env.get(S_FN_SUGAR) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_MACRO: {
				const [, params, body] = exp
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
					exp[M_FN] = env.get(S_MACRO) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_MACROEXPAND: {
				const ret = macroexpand(exp[1], env, cache)
				if (cache) {
					exp[M_FN] = env.get(S_MACROEXPAND) as MalFunc
					origExp[M_EVAL] = ret
				}
				return ret
			}
			case S_TRY: {
				const [, testExp, catchExp] = exp
				try {
					const ret = evalExp(testExp, env, cache)
					if (cache) {
						exp[M_FN] = env.get(S_TRY) as MalFunc
						origExp[M_EVAL] = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (
						isList(catchExp) &&
						catchExp[0] === S_CATCH &&
						isSymbol(catchExp[1])
					) {
						if (exc instanceof Error) {
							err = exc.message
						}
						const [, errSym, errBody] = catchExp
						const ret = evalExp(errBody, new Env(env, [errSym], [err]), cache)
						if (cache) {
							catchExp[M_FN] = env.get(S_CATCH) as MalFunc
							origExp[M_EVAL] = ret
						}
						return ret
					} else {
						throw err
					}
				}
			}
			case S_DO: {
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
			case S_IF: {
				const [, _test, thenExp, elseExp] = exp
				const test = evalExp(_test, env, cache)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				if (cache) {
					exp[M_FN] = env.get(S_IF) as MalFunc
				}
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
					exp[M_EVAL_PARAMS] = params

					const ret = fn(...params)
					if (cache) {
						setExpandInfo(exp as MalNodeSeq, {
							type: ExpandType.Constant,
							exp: ret
						})
						origExp[M_EVAL] = ret
						exp[M_FN] = fn
					}
					return ret
				} else {
					const type = capital(getType(fn))
					throw new MalError(
						`[EVAL] ${type} ${printExp(
							fn
						)} is not a function. First element of list always should be a function.`
					)
				}
			}
		}
	}

	throw new Error('[EVAL] Exceed the maximum TCO stacks')
}

// Cached Tree-shaking
export function replaceExp(original: MalNode, replaced: MalVal) {
	const outer = original[M_OUTER]
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isMalNode(outer)) {
		throw new MalError('Cannot execute replaceExp')
	}

	// // Inherit delimiters if possible
	// if (isMalNode(original) && original[M_DELIMITERS] && isMalNode(replaced)) {
	// 	replaced[M_DELIMITERS] = []
	// 	console.log('sdfd', original, replaced)
	// 	if (isList(original) && isList(replaced)) {
	// 		for (let i = 0; i < replaced.length; i++) {
	// 			const oi = Math.min(i, original.length - 2)
	// 			replaced.push(original[M_DELIMITERS][oi])
	// 		}
	// 		replaced.push(original[M_DELIMITERS][original.length - 1])
	// 	}
	// }

	// Set as child
	if (isSeq(outer)) {
		outer[index] = replaced
	} else {
		// hash map
		const key = outer[M_KEYS][index]
		outer[key] = replaced
	}

	delete outer[M_ELMSTRS]

	// Set outer recursively
	saveOuter(replaced, outer, index)

	// Refresh M_ELMSTRS of ancestors
	let _outer = outer

	while (_outer) {
		delete _outer[M_ELMSTRS]

		// Go upward
		_outer = _outer[M_OUTER]
	}
}
