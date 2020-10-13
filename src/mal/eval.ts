import {
	MalVal,
	MalCallableContext,
	MalError,
	MalSymbol,
	MalMap,
	MalList,
	MalSeq,
	isMalSeq,
	MalVector,
	MalMacro,
	MalNil,
	MalFn,
	MalString,
	MalType,
} from './types'
import Env from './env'
import SpecialForms from './special-forms-meta'
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
		const ret = MalList.create([MalSymbol.create('quote'), exp])
		ret.sugar = "'"
		return ret
	}

	if (MalSymbol.isFor(exp.value[0], 'unquote')) {
		return exp.value[1]
	}

	const ret = MalList.create([
		MalSymbol.create('concat'),
		...exp.value.map(e => {
			if (MalList.isCallOf(e, 'splice-unquote')) {
				return e.value[1]
			} else {
				return MalVector.create([quasiquote(e)])
			}
		}),
	])

	return MalList.is(exp) ? MalList.create([MalSymbol.create('lst'), ret]) : ret

	function isPair(x: MalVal): x is MalSeq {
		return isMalSeq(x) && x.value.length > 0
	}
}

function macroexpand(_exp: MalVal, env: Env) {
	let exp = _exp
	let fn: MalVal | undefined

	while (
		MalList.is(exp) &&
		MalSymbol.is(exp.first) &&
		(fn = env.find(exp.first.value))
	) {
		if (!MalMacro.is(fn)) {
			break
		}
		exp.first.evaluated = fn
		exp = fn.value.apply({callerEnv: env}, exp.rest)
	}

	// if (exp !== _exp && MalList.is(_exp)) {
	// 	setExpandInfo(_exp, {type: ExpandType.Constant, exp})
	// }

	return exp
}

function generateUnnamedParams(exp: MalVal) {
	// Traverse body
	let paramCount = 0,
		hasRest = false

	traverse(exp)

	const params = MalVector.create()

	for (let i = 1; i <= paramCount; i++) {
		params.value.push(MalSymbol.create(`%${i}`))
	}
	
	if (hasRest) {
		params.value.push(MalSymbol.create('&'), MalSymbol.create('%&'))
	}

	return params

	function traverse(exp: MalVal) {
		switch (exp.type) {
			case MalType.List:
			case MalType.Vector:
				exp.value.forEach(traverse)
				break
			case MalType.Map:
				exp.values().forEach(traverse)
				break
			case MalType.Symbol:
				if (exp.value.startsWith('%')) {
					if (exp.value === '%&') {
						hasRest = true
					} else {
						const c = parseInt(exp.value.slice(1) || '1')
						paramCount = Math.max(paramCount, c)
					}
				}
				break
		}
	}
}

export default function evalExp(
	this: void | MalCallableContext,
	exp: MalVal,
	env: Env
): MalVal {
	const origExp = exp

	let counter = 0
	while (counter++ < 1e7) {
		// Expand macro
		exp = macroexpand(exp, env)

		// evalAtom
		if (!MalList.is(exp)) {
			let ret: MalVal | undefined

			if (MalSymbol.is(exp)) {
				ret = env.get(exp.value)
			} else if (MalVector.is(exp)) {
				ret = MalVector.create(exp.value.map(x => evalExp.call(this, x, env)))
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

		// Eval () as nil
		if (exp.value.length === 0) {
			;(origExp as MalList).evaluated = MalNil.create()
			return MalNil.create()
		}

		// Apply list
		const first = MalSymbol.is(exp.first) ? exp.first.value : null

		switch (first) {
			case 'def': {
				// NOTE: disable defvar
				// case 'defvar': {
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
				const letEnv = new Env({name: 'let', outer: env})

				const [, binds, ...body] = exp.value
				if (!MalVector.is(binds)) {
					throw new MalError('let requires a vector for its binding')
				}
				for (let i = 0; i < binds.value.length; i += 2) {
					letEnv.bind(
						binds.value[i],
						evalExp.call(this, binds.value[i + 1], letEnv)
					)
				}
				env = letEnv
				exp =
					body.length === 1
						? body[0]
						: MalList.create([MalSymbol.create('do'), ...body])
				break // continue TCO loop
			}
			// case 'binding': {
			// 	const bindingEnv = new Env({name: 'binding'})
			// 	const [, binds, ..._body] = exp.value
			// 	if (!MalVector.is(binds)) {
			// 		throw new MalError('Invalid bind-expr in binding')
			// 	}
			// 	for (let i = 0; i < binds.value.length; i += 2) {
			// 		bindingEnv.bind(
			// 			binds.value[i],
			// 			evalExp.call(this, binds.value[i + 1], env)
			// 		)
			// 	}
			// 	env.pushBinding(bindingEnv)
			// 	const body =
			// 		_body.length === 1
			// 			? _body[0]
			// 			: MalList.create(MalSymbol.create('do'), ..._body)
			// 	let ret
			// 	try {
			// 		ret = evalExp.call(this, body, env)
			// 	} finally {
			// 		env.popBinding()
			// 	}
			// 	origExp.evaluated = ret
			// 	return ret
			// }
			// case 'get-all-symbols': {
			// 	const ret = MalVector.create(...env.getAllSymbols())
			// 	origExp.evaluated = ret
			// 	return ret
			// }
			// case 'fn-params': {
			// 	const fn = evalExp.call(this, exp.value[1], env)
			// 	const ret = MalFn.is(fn)
			// 		? MalVector.create(...fn.params)
			// 		: MalNil.create()
			// 	origExp.evaluated = ret
			// 	return ret
			// }
			// case 'eval*': {
			// 	// if (!this) {
			// 	// 	throw new MalError('Cannot find the caller env')
			// 	// }
			// 	const expanded = evalExp.call(this, exp.value[1], env)
			// 	exp = evalExp.call(this, expanded, this ? this.callerEnv : env)
			// 	break // continue TCO loop
			// }
			case 'quote': {
				const ret = exp.value[1]
				origExp.evaluated = ret
				return ret
			}
			case 'quasiquote': {
				exp = quasiquote(exp.value[1])
				break // continue TCO loop
			}
			case 'fn-sugar': {
				const body = exp.value[1]

				const params = generateUnnamedParams(exp)

				exp = MalList.create([MalSymbol.create('fn'), params, body])
				break // continue TCO loop
			}
			case 'fn':
			case 'macro': {
				const [, _params, body] = exp.value

				let params: MalVector | undefined
				if (MalVector.is(_params)) {
					params = _params
				} else if (MalMap.is(_params)) {
					params = MalVector.create([_params])
				}

				if (params === undefined) {
					throw new MalError(
						`The parameter of ${first} should be vector or map`
					)
				}
				if (body === undefined) {
					throw new MalError(`The body of ${first} is empty`)
				}
				const ret = (first === 'fn' ? MalFn : MalMacro).create((...args) => {
					return evalExp.call(
						this,
						body,
						new Env({outer: env, forms: params?.value, exps: args})
					)
				})
				ret.ast = {
					body,
					env,
					params,
				}

				origExp.evaluated = ret
				return ret
			}
			case 'macroexpand': {
				const ret = macroexpand(exp.value[1], env)
				origExp.evaluated = ret
				return ret
			}
			case 'try': {
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
						catchExp.value[1].evaluated = SpecialForms['catch'] as MalVal
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
				if (exp.value.length === 1) {
					origExp.evaluated = MalNil.create()
					return MalNil.create()
				}
				evalExp.call(this, MalVector.create(exp.value.slice(1, -1)), env)
				exp = exp.value[exp.value.length - 1]
				break // continue TCO loop
			}
			case 'if': {
				const [, _test, thenExp, elseExp] = exp.value
				const test = evalExp.call(this, _test, env)
				exp = test.value ? thenExp : elseExp || MalNil.create()
				break // continue TCO loop
			}
			default: {
				// is a function call

				// Evaluate all of parameters at first
				const [fn, ...params] = exp.value.map(e => evalExp.call(this, e, env))

				if (MalFn.is(fn)) {
					exp.first.evaluated = fn
					if (fn.ast) {
						// Lisp-defined functions
						env = new Env({
							outer: fn.ast.env,
							forms: fn.ast.params.value,
							exps: params,
							name: MalSymbol.is(exp.first) ? exp.first.value : 'anonymous',
						})
						exp = fn.ast.body
						// continue TCO loop
						break
					} else {
						// JS-defined functions
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
