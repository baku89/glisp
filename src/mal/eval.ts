/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	createMalFunc,
	isMalFunc,
	cloneExp,
	isKeyword,
	LispError,
	symbolFor as S,
	isSymbol,
	M_ISMACRO,
	M_EVAL,
	M_FN,
	isMap,
	MalMap,
	isList,
	isVector,
	markMalVector,
	MalNode,
	isMalNode,
	MalNodeList,
	M_EXPANDED,
	M_OUTER,
	M_OUTER_INDEX,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL_PARAMS,
	M_ISSUGAR,
	M_DELIMITERS,
	MalNodeMap
} from './types'
import Env from './env'
import printExp from './printer'
import {saveOuter} from './reader'

const S_DEF = S('def')
const S_LET = S('let')
const S_IF = S('if')
const S_DO = S('do')
const S_FN = S('fn')
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
const S_CONS = S('cons')

// eval

function quasiquote(exp: any): MalVal {
	if (!isPair(exp)) {
		return [S_QUOTE, exp]
	} else if (exp[0] === S_UNQUOTE) {
		return exp[1]
	} else if (isPair(exp[0]) && exp[0][0] === S_SPLICE_UNQUOTE) {
		return [S_CONCAT, exp[0][1], quasiquote(exp.slice(1))]
	} else {
		return [S_CONS, quasiquote(exp[0]), quasiquote(exp.slice(1))]
	}

	function isPair(x: MalVal) {
		return Array.isArray(x) && x.length > 0
	}
}

function macroexpand(exp: MalVal, env: Env, cache: boolean) {
	while (isList(exp) && isSymbol(exp[0]) && env.find(exp[0])) {
		const fn = env.get(exp[0])
		if (!isMalFunc(fn) || !fn[M_ISMACRO]) {
			break
		}
		;(exp as MalNodeList)[M_FN] = fn

		const params = exp.slice(1)
		if (cache) {
			;(exp as MalNodeList)[M_EVAL_PARAMS] = params
		}
		exp = fn(...params)
	}
	return exp
}

function evalAtom(exp: MalVal, env: Env, cache: boolean) {
	if (isSymbol(exp)) {
		return env.get(exp)
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
		return isVector(exp) ? markMalVector(ret) : ret
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

export default function evalExp(exp: MalVal, env: Env, cache = false): MalVal {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!isList(exp)) {
			return evalAtom(exp, env, cache)
		}

		const expandedExp = macroexpand(exp, env, cache)
		if (cache && exp !== expandedExp) {
			;(exp as MalNodeList)[M_EXPANDED] = expandedExp
		}
		exp = expandedExp

		if (!isList(exp)) {
			return evalAtom(exp, env, cache)
		}

		if (exp.length === 0) {
			return exp
		}

		// Apply list
		const [a0, a1, a2, a3] = exp

		// Special Forms
		switch (a0) {
			case S_DEF: {
				const ret = env.set(a1 as string, evalExp(a2, env, cache))
				if (cache) {
					;(exp as MalNodeList)[M_FN] = env.get(S_DEF) as MalFunc
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_LET: {
				const letEnv = new Env(env)
				const binds = a1 as MalVal[]
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], letEnv, cache) as MalVal[]
					)
				}
				env = letEnv
				const ret = exp.length === 3 ? a2 : [S_DO, ...exp.slice(2)]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case S('binding'): {
				const bindingEnv = env.pushBinding()
				const binds = a1 as MalVal[]
				for (let i = 0; i < binds.length; i += 2) {
					bindingEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], bindingEnv, cache) as MalVal[]
					)
				}
				const ret = evalExp([S_DO, ...exp.slice(2)], env, cache)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				env.popBinding()
				return ret
			}
			case S('eval-in-env'): {
				// Don't know why this should be nested
				const expanded = evalExp(a1, env, true)
				const ret = evalExp(expanded, env, true)
				;(exp as MalNode)[M_EVAL] = a2
				;(expanded as MalNode)[M_EVAL] = ret
				return ret
			}
			case S_QUOTE:
				// No need to cache M_EVAL
				// if (cache) {
				// 	;(exp as MalNode)[M_EVAL] = a1
				// }
				return a1
			case S_QUASIQUOTE: {
				const ret = quasiquote(a1)
				// No need to cache M_EVAL
				// if (cache) {
				// 	;(exp as MalNode)[M_EVAL] = ret
				// }
				exp = ret
				break // continue TCO loop
			}
			case S_FN:
				if (!Array.isArray(a1)) {
					throw new LispError('Second element of fn should be list')
				}
				return createMalFunc(
					(...args) => evalExp(a2, new Env(env, a1 as any[], args), cache),
					a2,
					env,
					a1 as string[]
				)
			case S_FN_SUGAR:
				return createMalFunc(
					(...args) => evalExp(a1, new Env(env, [], args), cache),
					a1,
					env,
					[]
				)
			case S_MACRO: {
				if (!Array.isArray(a1)) {
					throw new LispError('Second element of macro should be list')
				}
				const fnexp = [S_FN, a1, a2]
				const fn = cloneExp(evalExp(fnexp, env, cache)) as MalFunc
				fn[M_ISMACRO] = true
				return fn
			}
			case S_MACROEXPAND: {
				const ret = macroexpand(a1, env, cache)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_TRY:
				try {
					const ret = evalExp(a1, env, cache)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (a2 && Array.isArray(a2) && a2[0] === S_CATCH) {
						if (exc instanceof Error) {
							err = exc.message
						}
						const ret = evalExp(
							a2[2],
							new Env(env, [a2[1] as string], [err]),
							cache
						)
						if (cache) {
							;(exp as MalNode)[M_EVAL] = ret
						}
						return ret
					} else {
						throw err
					}
				}
			case S_DO: {
				evalAtom(exp.slice(1, -1), env, cache)
				const ret = exp[exp.length - 1]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalNodeList)[M_EXPANDED] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case S_IF: {
				const test = evalExp(a1, env, cache)
				const ret = test ? a2 : a3 !== undefined ? a3 : null
				if (cache) {
					;(exp as MalNode)[M_EVAL] = a2
					;(exp as MalNodeList)[M_EXPANDED] = a2
				}
				exp = ret
				break // continue TCO loop
			}
			case S('env-chain'): {
				const envs = env.getChain()
				exp = [S('println'), envs.map(e => e.name).join(' <- ')]
				break // continue TCO loop
			} /*
			case 'which-env': {
				let _env: Env | null = env
				const envs = []

				do {
					envs.push(_env)
					_env = _env.outer
				} while (_env)

				exp = [
					S('println'),
					envs
						.filter(e => e.hasOwn(a1 as string))
						.map(e => e.name)
						.join(' <- ') || 'not defined'
				]
				break
			}s
			*/
			default: {
				// Apply Function
				const [fn, ...args] = evalAtom(exp, env, cache) as MalVal[]

				if (isMalFunc(fn) || typeof fn === 'function') {
					;(exp as MalNodeList)[M_EVAL_PARAMS] = args
					const ret = fn(...args)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
						;(exp as MalNodeList)[M_FN] = fn
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

const MALNODELIST_SYMBOLS = [
	M_ISSUGAR,
	M_DELIMITERS,
	M_ELMSTRS,
	M_FN,
	M_EVAL,
	M_EVAL_PARAMS,
	M_EXPANDED,
	M_OUTER,
	M_OUTER_INDEX
]

const MALNODEMAP_SYMBOLS = [
	M_DELIMITERS,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL,
	M_OUTER,
	M_OUTER_INDEX
]

function cloneMalNode(original: MalNode) {
	let cloned: MalNode

	const isArray = Array.isArray(original)

	if (isArray) {
		cloned = [...(original as MalNodeList)] as MalNodeList
		if (isVector(original)) {
			markMalVector(cloned)
		}
	} else {
		cloned = {...original} as MalNodeMap
	}

	const symbols = isArray ? MALNODELIST_SYMBOLS : MALNODEMAP_SYMBOLS

	for (const sym of symbols) {
		if (sym in original) {
			;(cloned as any)[sym] = (original as any)[sym]
		}
	}

	return cloned
}

// Cached Tree-shaking
export function replaceExp(original: MalNode, replaced: MalVal) {
	const originalOuter = original[M_OUTER]
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isMalNode(originalOuter)) {
		throw new LispError('Cannot execute replaceExp')
		return
	}

	const outer = cloneMalNode(originalOuter)

	// Set as child
	if (Array.isArray(outer)) {
		outer[index] = replaced
	} else {
		// hash map
		const key = outer[M_KEYS][index]
		outer[key] = replaced
	}

	// Set outer recursively
	saveOuter(replaced, outer, index)

	// Refresh M_ELMSTRS of ancestors
	let _outer = outer,
		_index = index,
		_exp = replaced

	while (_outer) {
		_outer[M_ELMSTRS][_index] = printExp(_exp)

		// Go upward
		_exp = _outer
		_index = _outer[M_OUTER_INDEX]
		_outer = _outer[M_OUTER]

		if (!_outer) {
			return
		}

		_outer = cloneMalNode(_outer)
	}
}
