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
	M_ENV,
	M_PARAMS,
	M_AST,
	M_EVAL,
	M_FN,
	isMap,
	MalMap,
	isList,
	isVector,
	markMalVector,
	MalNode,
	isMalNode,
	MalListNode,
	M_MACROEXPANDED,
	M_OUTER,
	M_OUTER_INDEX,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL_PARAMS
} from './types'
import Env from './env'
import printExp from './printer'
import {saveOuter} from './reader'

// eval
const isPair = (x: MalVal) => Array.isArray(x) && x.length > 0

function quasiquote(exp: any): MalVal {
	if (!isPair(exp)) {
		return [S('quote'), exp]
	} else if (exp[0] === S('unquote')) {
		return exp[1]
	} else if (isPair(exp[0]) && exp[0][0] === S('splice-unquote')) {
		return [S('concat'), exp[0][1], quasiquote(exp.slice(1))]
	} else {
		return [S('cons'), quasiquote(exp[0]), quasiquote(exp.slice(1))]
	}
}

function macroexpand(exp: MalVal, env: Env) {
	while (isList(exp) && isSymbol(exp[0]) && env.find(exp[0])) {
		const fn = env.get(exp[0])
		if (!isMalFunc(fn) || !fn[M_ISMACRO]) {
			break
		}
		;(exp as MalListNode)[M_FN] = fn
		exp = fn(...exp.slice(1))
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

		const expandedExp = macroexpand(exp, env)
		if (cache && exp !== expandedExp) {
			;(exp as MalListNode)[M_MACROEXPANDED] = expandedExp
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
		switch (isSymbol(a0) ? (a0 as string).slice(1) : null) {
			case 'def': {
				const ret = env.set(a1 as string, evalExp(a2, env, cache))
				if (cache) {
					;(exp as MalListNode)[M_FN] = env.get(S('def'))
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case 'let': {
				const letEnv = new Env(env)
				const binds = a1 as MalVal[]
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], letEnv, cache) as MalVal[]
					)
				}
				env = letEnv
				const ret = exp.length === 3 ? a2 : [S('do'), ...exp.slice(2)]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case 'quote':
				if (cache) {
					;(exp as MalNode)[M_EVAL] = a1
				}
				return a1
			case 'quasiquote': {
				const ret = quasiquote(a1)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case 'fn':
				return createMalFunc(
					(...args) => evalExp(a2, new Env(env, a1 as string[], args), cache),
					a2,
					env,
					a1 as string[]
				)
			case 'macro': {
				const fnexp = [S('fn'), a1, a2]
				const fn = cloneExp(evalExp(fnexp, env, cache)) as MalFunc
				fn[M_ISMACRO] = true
				return fn
			}
			case 'macroexpand': {
				const ret = macroexpand(a1, env)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case 'try':
				try {
					const ret = evalExp(a1, env, cache)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (a2 && Array.isArray(a2) && a2[0] === S('catch')) {
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
			case 'do': {
				evalAtom(exp.slice(1, -1), env, cache)
				const ret = exp[exp.length - 1]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalListNode)[M_MACROEXPANDED] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				const test = evalExp(a1, env, cache)
				const ret = test ? a2 : a3 !== undefined ? a3 : null
				if (cache) {
					;(exp as MalNode)[M_EVAL] = a2
					;(exp as MalListNode)[M_MACROEXPANDED] = a2
				}
				exp = ret
				break // continue TCO loop
			}
			/*
			case 'env-chain': {
				let _env: Env | null = env
				const envs = []

				do {
					envs.push(_env)
					_env = _env.outer
				} while (_env)

				exp = [S('println'), envs.map(e => e.name).join(' <- ')]
				break // continue TCO loop
			}
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
			}
			*/
			default: {
				// Apply Function
				const [_fn, ...args] = evalAtom(exp, env, cache) as MalVal[]

				const fn = _fn as MalFunc

				if (isMalFunc(fn) || typeof fn === 'function') {
					;(exp as MalListNode)[M_EVAL_PARAMS] = args
				}

				if (isMalFunc(fn)) {
					env = new Env(fn[M_ENV], fn[M_PARAMS], args)
					const ret = fn(...args)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
						;(exp as MalListNode)[M_FN] = fn
					}
					// exp = fn[M_AST]
					// break // continue TCO loop
					return ret
				} else if (typeof fn === 'function') {
					const ret = (fn as any)(...args)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
						;(exp as MalListNode)[M_FN] = fn
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

// Cached Tree-shaking
export function replaceExp(original: MalNode, replaced: MalVal) {
	const outer = original[M_OUTER]
	const index = original[M_OUTER_INDEX]
	if (index !== undefined) {
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
		}
	} else {
		console.error('sdifsodfijsf')
	}
}
