import {
	MalVal,
	MalFuncThis,
	MalError,
	MalSymbol,
	MalMap,
	MalList,
	MalColl,
	isMalColl,
	MalSeq,
	isMalSeq,
	MalVector,
	setExpandInfo,
	ExpandType,
	MalMacro,
	MalNil,
	MalFunc,, MalNumber, MalAtom, MalBoolean, MalString, MalKeyword
} from './types'
import Env from './env'
import {printExp} from '.'
import {capital} from 'case'

const S_DEF = MalSymbol.create('def')
const S_DEFVAR = MalSymbol.create('defvar')
const S_LET = MalSymbol.create('let')
const S_BINDING = MalSymbol.create('binding')
const S_IF = MalSymbol.create('if')
const S_DO = MalSymbol.create('do')
const S_FN = MalSymbol.create('fn')
const S_GET_ALL_SYMBOLS = MalSymbol.create('get-all-symbols')
const S_FN_PARAMS = MalSymbol.create('fn-params')
const S_FN_SUGAR = MalSymbol.create('fn-sugar')
const S_MACRO = MalSymbol.create('macro')
const S_MACROEXPAND = MalSymbol.create('macroexpand')
const S_QUOTE = MalSymbol.create('quote')
const S_QUASIQUOTE = MalSymbol.create('quasiquote')
const S_TRY = MalSymbol.create('try')
const S_CATCH = MalSymbol.create('catch')
const S_CONCAT = MalSymbol.create('concat')
const S_EVAL_IN_ENV = MalSymbol.create('eval*')
const S_LST = MalSymbol.create('lst')

function quasiquote(exp: MalVal): MalVal {
	if (MalMap.is(exp)) {
		const ret: {[k: string]: MalVal} = {}
		for (const [k, v] of Object.entries(exp)) {
			ret[k] = quasiquote(v)
		}
		return MalMap.create(ret)
	}

	if (!isPair(exp)) {
		return MalList.create(S_QUOTE, exp)
	}

	if (MalSymbol.isFor(exp.value[0], 'unquote')) {
		return exp.value[1]
	}

	let ret = MalList.create(
		S_CONCAT,
		...exp.value.map(e => {
			if (isPair(e) && MalSymbol.isFor(e.value[0], 'splice-unquote')) {
				return e.value[1]
			} else {
				return MalVector.create(quasiquote(e))
			}
		})
	)
	ret = MalList.is(exp) ? MalList.create(S_LST, ret) : ret
	return ret

	function isPair(x: MalVal): x is MalSeq {
		return isMalSeq(x) && x.value.length > 0
	}
}

function macroexpand(_exp: MalVal, env: Env) {
	let exp = _exp

	while (
		MalList.is(exp) &&
		MalSymbol.is(exp.value[0]) &&
		env.find(exp.value[0] as MalSymbol)
	) {
		const fn = env.get(exp.value[0] as MalSymbol)
		if (!MalMacro.is(fn)) {
			break
		}
		;(exp.value[0] as MalSymbol).evaluated = fn
		exp = fn.value.apply({callerEnv: env}, exp.params)
	}

	if (exp !== _exp && MalList.is(_exp)) {
		setExpandInfo(_exp, {type: ExpandType.Constant, exp})
	}

	return exp
}

function evalAtom(this: void | MalFuncThis, exp: MalVal, env: Env) {
	if (MalSymbol.is(exp)) {
		const ret = env.get(exp)
		exp.evaluated = ret
		return ret
	} else if (MalVector.is(exp)) {
		const ret = MalVector.create(
			...exp.value.map(x => {
				const ret = evalExp.call(this, x, env)
				if (isMalColl(x)) {
					x.evaluated = ret
				}
				return ret
			})
		)
		exp.evaluated = ret
		return ret
	} else if (MalMap.is(exp)) {
		const hm: {[k: string]: MalVal} = {}

		for (const [k, v] of exp.entries()) {
			const ret = evalExp.call(this, v, env)
			if (isMalColl(v)) {
				v.evaluated = ret
			}
			hm[k] = ret
		}

		const ret = MalMap.create(hm)
		exp.evaluated = ret
		return ret
	}

	return exp
}

export default function evalExp(
	this: void | MalFuncThis,
	exp: MalVal,
	env: Env
): MalVal {
	const origExp: MalSeq = exp as MalSeq

	let counter = 0
	while (counter++ < 1e6) {
		if (!MalList.is(exp)) {
			const ret = evalAtom.call(this, exp, env)
			if (isMalColl(origExp)) {
				origExp.evaluated = ret
			}
			return ret
		}

		// Expand macro
		exp = macroexpand(exp, env)

		if (!MalList.is(exp)) {
			const ret = evalAtom.call(this, exp, env)
			if (isMalColl(origExp)) {
				origExp.evaluated = ret
			}
			return ret
		}

		if (exp.value.length === 0) {
			if (isMalColl(origExp)) {
				origExp.evaluated = MalNil.create()
			}
			return MalNil.create()
		}

		// Apply list
		const [first] = exp.value

		if (!MalSymbol.is(first)) {
			throw new MalError(
				`${capital(first.type)} ${printExp(
					first
				)} is not a function. First element of list always should be a function.`
			)
		}

		switch (first.value) {
			case 'def': {
				first.evaluated = env.get(S_DEF)
				const [, sym, form] = exp.value
				if (!MalSymbol.is(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = env.set(sym, evalExp.call(this, form, env))
				setExpandInfo(exp, {
					type: ExpandType.Unchange,
				})
				origExp.evaluated = ret
				return ret
			}
			case 'defvar': {
				first.evaluated = env.get(S_DEFVAR)
				const [, sym, form] = exp.value
				if (!MalSymbol.is(sym) || form === undefined) {
					throw new MalError('Invalid form of defvar')
				}
				const ret = evalExp.call(this, form, env)
				env.set(sym, ret, exp)
				origExp.evaluated = ret
				return ret
			}
			case 'let': {
				first.evaluated = env.get(S_LET)

				const letEnv = new Env(env)
				const [, binds, ...body] = exp.value
				if (!MalVector.is(binds)) {
					throw new MalError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.value.length; i += 2) {
					letEnv.bindAll(
						binds[i],
						evalExp.call(this, binds[i + 1], letEnv) as MalVal[]
					)
				}
				env = letEnv
				const ret = body.length === 1 ? body[0] : L(S_DO, ...body)
				setExpandInfo(exp, {
					type: ExpandType.Env,
					exp: ret,
					env: letEnv,
				})
				exp = ret
				break // continue TCO loop
			}
			case 'binding': {
				first.evaluated = env.get(S_BINDING)
				const bindingEnv = new Env(undefined, undefined, undefined, 'binding')
				const [, binds, ..._body] = exp.value
				if (!isMalSeq(binds)) {
					throw new MalError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.value.length; i += 2) {
					bindingEnv.bindAll(
						binds[i],
						evalExp.call(this, binds[i + 1], env)
					)
				}
				env.pushBinding(bindingEnv)
				const body = _body.length === 1 ? _body[0] : L(S_DO, ..._body)
				let ret
				try {
					ret = evalExp.call(this, body, env)
				} finally {
					env.popBinding()
				}
				origExp.evaluated = ret
				return ret
			}
			case 'get-all-symbols': {
				const ret = env.getAllSymbols()
				first.evaluated = env.get(S_GET_ALL_SYMBOLS)
					origExp.evaluated = ret
				return ret
			}
			case 'fn-params': {
					first.evaluated = env.get(S_FN_PARAMS)
				const fn = evalExp.call(this, exp.value[1], env)
				const ret = isMalFunc(fn) ? [...fn[M_PARAMS]] : MalNil.create()
				origExp.evaluated = ret
				return ret
			}
			case 'eval*': {
					first.evaluated = env.get(S_EVAL_IN_ENV)
				// if (!this) {
				// 	throw new MalError('Cannot find the caller env')
				// }
				const expanded = evalExp.call(this, exp.value[1], env)
				exp = evalExp.call(this, expanded, this ? this.callerEnv : env)
				break // continue TCO loop
			}
			case 'quote': {
				const ret = exp.value[1]
					first.evaluated = env.get(S_QUOTE)
					origExp.evaluated = ret
				return ret
			}
			case 'quasiquote': {
					first.evaluated = env.get(S_QUASIQUOTE)
				const ret = quasiquote(exp.value[1])
				exp = ret
				break // continue TCO loop
			}
			case 'fn': {
				const [, , body] = exp.value
				let [, params] = exp.value
				if (MalMap.is(params)) {
					params = MalVector.create(params)
				}
				if (!MalVector.is(params)) {
					throw new MalError('First argument of fn should be vector or map')
				}
				if (body === undefined) {
					throw new MalError('Second argument of fn should be specified')
				}
				const ret = MalFunc.fromMal(
					function (...args) {
						return evalExp.call(this, body, new Env(env, params, args))
					},
					body,
					env,
					params as MalVal
				)
				if (cache) {
					first.evaluated = env.get(S_FN)
					origExp.evaluated = ret
				}
				return ret
			}
			case 'fn-sugar': {
				if (cache) {
					first.evaluated = env.get(S_FN_SUGAR)
				}
				const body = exp.value[1]
				const ret = MalFunc.fromMal(
					function (...args) {
						return evalExp.call(this, body, new Env(env, [], args))
					},
					body,
					env
				)
				origExp.evaluated = ret
				return ret
			}
			case 'macro': {
				first.evaluated = env.get(S_MACRO)
				const [, , body] = exp.value
				let [, params] = exp.value
				if (MalMap.is(params)) {
					params = MalVector.create(params)
				}
				if (!MalVector.is(params)) {
					throw new MalError('First argument of macro should be vector or map')
				}
				if (body === undefined) {
					throw new MalError('Second argument of macro should be specified')
				}
				const ret = MalMacro.fromMal(
					function (...args) {
						return evalExp.call(this, body, new Env(env, params, args))
					},
					body,
					env,
					params
				)
				origExp.evaluated = ret
				return ret
			}
			case 'macroexpand': {
				first.evaluated = env.get(S_MACROEXPAND)
				const ret = macroexpand(exp.value[1], env)
				origExp.evaluated = ret
				return ret
			}
			case 'try': {
				if (cache) {
					first.evaluated = env.get(S_TRY)
				}
				const [, testExp, catchExp] = exp.value
				try {
					const ret = evalExp.call(this, testExp, env)
					if (cache) {
						origExp.evaluated = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (
						MalList.is(catchExp) &&
						MalSymbol.isFor(catchExp.value[0], 'catch') &&
						MalSymbol.is(catchExp.value[1])
					) {
						if (cache) {
							first.evaluated = env.get(S_CATCH)
						}
						if (exc instanceof Error) {
							err = exc.message
						}
						const [, errSym, errBody] = catchExp.value
						const ret = evalExp.call(
							this,
							errBody,
							new Env(env, [errSym], [err]),
							cache
						)
						if (cache) {
							origExp.evaluated = ret
						}
						return ret
					} else {
						throw err
					}
				}
			}
			case 'do': {
				first.evaluated = env.get(S_DO)
				if (exp.value.length === 1) {
					if (isMalColl(origExp)) {
						origExp.evaluated = MalNil.create()
					}
					return MalNil.create()
				}
				evalExp.call(this, MalVector.create(...exp.value.slice(1, -1)), env)
				const ret = exp.value[exp.value.length - 1]
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				first.evaluated = env.get(S_IF)
				const [, _test, thenExp, elseExp] = exp.value
				const test = evalExp.call(this, _test, env)
				const ret = test
					? thenExp
					: elseExp !== undefined
					? elseExp
					: MalNil.create()
				exp = ret
				break // continue TCO loop
			}
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = exp.value.map(e => evalExp.call(this, e, env))

				if (fn instanceof Function) {
					first.evaluated = fn
					if (MalFunc.is(fn)) {
						env = new Env(
							fn.env,
							fn.params,
							params,

							MalSymbol.is(first) ? first.value : undefined
						)
						exp = fn.exp
						// continue TCO loop
						break
					} else {
						const ret = fn.apply({callerEnv: env}, params)
						origExp.evaluated = ret
						return ret
					}
				}
			}
		}
	}

	throw new Error('Exceed the maximum TCO stacks')
}
