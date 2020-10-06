import {
	MalVal,
	MalFuncThis,
	MalError,
	MalSymbol,
	MalMap,
	MalList,
	MalSeq,
	isMalSeq,
	MalVector,
	MalMacro,
	MalNil,
	MalFunc,
	MalString,
} from './types'
import Env from './env'
import {capital} from 'case'
// import {setExpandInfo, ExpandType} from './expand'

function quasiquote(exp: MalVal): MalVal {
	if (MalMap.is(exp)) {
		const ret: {[k: string]: MalVal} = {}
		for (const [k, v] of exp.entries()) {
			ret[k] = quasiquote(v)
		}
		return MalMap.create(ret)
	}

	if (!isPair(exp)) {
		return MalList.create(MalSymbol.create('quote'), exp)
	}

	if (MalSymbol.isFor(exp.value[0], 'unquote')) {
		return exp.value[1]
	}

	const ret = MalList.create(
		MalSymbol.create('concat'),
		...exp.value.map(e => {
			if (MalList.isCallOf(e, 'splice-unquote')) {
				return e.value[1]
			} else {
				return MalVector.create(quasiquote(e))
			}
		})
	)

	return MalList.is(exp) ? MalList.create(MalSymbol.create('lst'), ret) : ret

	function isPair(x: MalVal): x is MalSeq {
		return isMalSeq(x) && x.value.length > 0
	}
}

function macroexpand(_exp: MalVal, env: Env) {
	let exp = _exp

	while (MalList.is(exp)) {
		const fn = evalExp(exp.fn, env)
		if (!MalMacro.is(fn)) {
			break
		}
		exp.value[0].evaluated = fn
		exp = fn.value.apply({callerEnv: env}, exp.params)
	}

	// if (exp !== _exp && MalList.is(_exp)) {
	// 	setExpandInfo(_exp, {type: ExpandType.Constant, exp})
	// }

	return exp
}

export default function evalExp(
	this: void | MalFuncThis,
	exp: MalVal,
	env: Env
): MalVal {
	const origExp = exp

	let counter = 0
	while (counter++ < 1e7) {
		// Expand macro
		exp = macroexpand(exp, env)

		if (!MalList.is(exp)) {
			let ret: MalVal | null = null

			if (MalSymbol.is(exp)) {
				ret = env.get(exp.value)
			} else if (MalVector.is(exp)) {
				ret = MalVector.create(
					...exp.value.map(x => evalExp.call(this, x, env))
				)
			} else if (MalMap.is(exp)) {
				ret = MalMap.create(
					Object.fromEntries(
						exp.entries().map(([k, v]) => [k, evalExp.call(this, v, env)])
					)
				)
			}

			if (ret) {
				origExp.evaluated = ret
			}
			return ret || exp
		}

		if (exp.value.length === 0) {
			origExp.evaluated = MalNil.create()
			return MalNil.create()
		}

		// Apply list
		const first = exp.fn

		if (!MalSymbol.is(first)) {
			throw new MalError(
				`${capital(
					first.type
				)} ${first.print()} is not a function. First element of list always should be a function.`
			)
		}

		switch (first.value) {
			case 'def': {
				// NOTE: disable defvar
				// case 'defvar': {
				first.evaluated = env.get('def')
				const [, sym, form] = exp.value
				if (!MalSymbol.is(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = evalExp.call(this, form, env)
				env.set(sym.value, ret)
				// setExpandInfo(exp, {
				// 	type: ExpandType.Unchange,
				// })
				origExp.evaluated = ret
				return ret
			}
			case 'let': {
				first.evaluated = env.get('let')

				const letEnv = new Env({name: 'let', outer: env})

				const [, binds, ...body] = exp.value
				if (!MalVector.is(binds)) {
					throw new MalError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.value.length; i += 2) {
					letEnv.bind(
						binds.value[i],
						evalExp.call(this, binds.value[i + 1], letEnv)
					)
				}
				env = letEnv
				const ret =
					body.length === 1
						? body[0]
						: MalList.create(MalSymbol.create('do'), ...body)
				// setExpandInfo(exp, {
				// 	type: ExpandType.Env,
				// 	exp: ret,
				// 	env: letEnv,
				// })
				exp = ret
				break // continue TCO loop
			}
			case 'binding': {
				first.evaluated = env.get('binding')
				const bindingEnv = new Env({name: 'binding'})
				const [, binds, ..._body] = exp.value
				if (!MalVector.is(binds)) {
					throw new MalError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.value.length; i += 2) {
					bindingEnv.bind(
						binds.value[i],
						evalExp.call(this, binds.value[i + 1], env)
					)
				}
				env.pushBinding(bindingEnv)
				const body =
					_body.length === 1
						? _body[0]
						: MalList.create(MalSymbol.create('do'), ..._body)
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
				const ret = MalVector.create(...env.getAllSymbols())
				first.evaluated = env.get('get-all-symbols')
				origExp.evaluated = ret
				return ret
			}
			case 'fn-params': {
				first.evaluated = env.get('fn-params')
				const fn = evalExp.call(this, exp.value[1], env)
				const ret = MalFunc.is(fn)
					? MalVector.create(...fn.params)
					: MalNil.create()
				origExp.evaluated = ret
				return ret
			}
			case 'eval*': {
				first.evaluated = env.get('eval*')
				// if (!this) {
				// 	throw new MalError('Cannot find the caller env')
				// }
				const expanded = evalExp.call(this, exp.value[1], env)
				exp = evalExp.call(this, expanded, this ? this.callerEnv : env)
				break // continue TCO loop
			}
			case 'quote': {
				const ret = exp.value[1]
				first.evaluated = env.get('quote')
				origExp.evaluated = ret
				return ret
			}
			case 'quasiquote': {
				first.evaluated = env.get('quasiquote')
				const ret = quasiquote(exp.value[1])
				exp = ret
				break // continue TCO loop
			}
			case 'fn-sugar': {
				first.evaluated = env.get('fn-sugar')
				const body = exp.value[1]
				const ret = MalFunc.fromMal(
					(...args) => {
						return evalExp.call(
							this,
							body,
							new Env({outer: env, exps: args, useUnnamedForms: true})
						)
					},
					body,
					env
				)
				origExp.evaluated = ret
				return ret
			}
			case 'fn':
			case 'macro': {
				first.evaluated = env.get(first.value)
				const [, _params, body] = exp.value
				let params: MalVal[] | undefined
				if (MalVector.is(_params)) {
					params = _params.value
				} else if (MalMap.is(_params)) {
					params = [_params]
				}
				if (!params) {
					console.log(exp.print())
					throw new MalError(
						`The parameter of ${first.value} should be vector or map`
					)
				}
				if (body === undefined) {
					throw new MalError(`The body of ${first.value} is empty`)
				}
				const ret = (first.value === 'fn' ? MalFunc : MalMacro).fromMal(
					(...args) => {
						return evalExp.call(
							this,
							body,
							new Env({outer: env, forms: params, exps: args})
						)
					},
					body,
					env,
					params
				)
				origExp.evaluated = ret
				return ret
			}
			case 'macroexpand': {
				first.evaluated = env.get('macroexpand')
				const ret = macroexpand(exp.value[1], env)
				origExp.evaluated = ret
				return ret
			}
			case 'try': {
				first.evaluated = env.get('try')
				const [, testExp, catchExp] = exp.value
				try {
					const ret = evalExp.call(this, testExp, env)
					origExp.evaluated = ret
					return ret
				} catch (err) {
					if (
						MalList.isCallOf(catchExp, 'catch') &&
						MalSymbol.is(catchExp.value[1])
					) {
						catchExp.value[1].evaluated = env.get('catch')
						const [, errSym, errBody] = catchExp.value

						const message = MalString.create(
							err instanceof Error ? err.message : 'Error'
						)
						const ret = evalExp.call(
							this,
							errBody,
							new Env({
								outer: env,
								forms: [errSym],
								exps: [message],
								name: 'catch',
							})
						)
						origExp.evaluated = ret
						return ret
					} else {
						throw err
					}
				}
			}
			case 'do': {
				first.evaluated = env.get('do')
				if (exp.value.length === 1) {
					origExp.evaluated = MalNil.create()
					return MalNil.create()
				}
				evalExp.call(this, MalVector.create(...exp.value.slice(1, -1)), env)
				const ret = exp.value[exp.value.length - 1]
				exp = ret
				break // continue TCO loop
			}
			case 'if': {
				first.evaluated = env.get('if')
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

				if (MalFunc.is(fn)) {
					first.evaluated = fn
					if (MalFunc.is(fn) && fn.exp) {
						env = new Env({
							outer: fn.env,
							forms: fn.params,
							exps: params,
							name: MalSymbol.is(first) ? first.value : 'anonymous',
						})
						exp = fn.exp
						// continue TCO loop
						break
					} else {
						const ret = fn.value.apply({callerEnv: env}, params)
						origExp.evaluated = ret
						return ret
					}
				} else {
					throw new MalError('Invalid first')
				}
			}
		}
	}

	throw new MalError('Exceed the maximum TCO stacks')
}
