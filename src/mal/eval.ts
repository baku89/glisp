import {
	MalVal,
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

async function macroexpand(_exp: MalVal, env: Env) {
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
		exp = await fn.value(...exp.rest)
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

export default async function evalExp(exp: MalVal, env: Env): Promise<MalVal> {
	const origExp = exp

	let counter = 0
	TCO: while (counter++ < 1e7) {
		// Expand macro
		exp = await macroexpand(exp, env)

		// evalAtom
		if (!MalList.is(exp)) {
			let ret: MalVal | undefined

			switch (exp.type) {
				case MalType.Symbol:
					ret = env.get(exp.value)
					break
				case MalType.Vector: {
					const vec = []
					for (const x of exp.value) {
						vec.push(await evalExp(x, env))
					}
					ret = MalVector.create(vec)
					break
				}
				case MalType.Map: {
					const entries = []
					for (const [k, v] of exp.entries()) {
						entries.push([k, await evalExp(v, env)])
					}
					ret = MalMap.create(Object.fromEntries(entries))
					break
				}
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

		// Special forms
		switch (first) {
			case 'def': {
				// NOTE: disable defvar
				// case 'defvar': {
				const [, sym, form] = exp.value
				if (!MalSymbol.is(sym) || form === undefined) {
					throw new MalError('Invalid form of def')
				}
				const ret = await evalExp(form, env)
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
					letEnv.bind(binds.value[i], await evalExp(binds.value[i + 1], letEnv))
				}
				env = letEnv
				exp =
					body.length === 1
						? body[0]
						: MalList.create([MalSymbol.create('do'), ...body])
				continue TCO
			}
			case 'quote':
				return (origExp.evaluated = exp.value[1])
			case 'quasiquote': {
				exp = quasiquote(exp.value[1])
				continue TCO
			}
			case 'fn-sugar': {
				const body = exp.value[1]
				const params = generateUnnamedParams(exp)
				exp = MalList.create([MalSymbol.create('fn'), params, body])
				continue TCO
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
				const ret = (first === 'fn' ? MalFn : MalMacro).create(
					async (...args) => {
						return await evalExp(
							body,
							new Env({outer: env, forms: params?.value, exps: args})
						)
					}
				)
				ret.ast = {
					body,
					env,
					params,
				}

				origExp.evaluated = ret
				return ret
			}
			case 'macroexpand':
				return (origExp.evaluated = await macroexpand(exp.value[1], env))
			case 'try': {
				const [, testExp, catchExp] = exp.value
				try {
					const ret = await evalExp(testExp, env)
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
						const ret = await evalExp(
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
					}
					throw err
				}
			}
			case 'do': {
				if (exp.value.length === 1) {
					return (origExp.evaluated = MalNil.create())
				}
				await evalExp(MalVector.create(exp.value.slice(1, -1)), env)
				exp = exp.value[exp.value.length - 1]
				continue TCO
			}
			case 'if': {
				const [, _test, thenExp, elseExp] = exp.value
				const test = await evalExp(_test, env)
				exp = test.value ? thenExp : elseExp || MalNil.create()
				continue TCO
			}
		}
		// Function Call

		// Evaluate all of parameters at first
		const fn = await evalExp(exp.first, env)
		const params = []
		for (const p of exp.rest) {
			params.push(await evalExp(p, env))
		}

		if (!MalFn.is(fn)) {
			throw new MalError('First element of List should be function')
		}

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
			continue TCO
		} else {
			// JS-defined functions
			return (origExp.evaluated = await fn.value(...params))
		}
	} // End of TCO

	throw new MalError('Exceed the maximum TCO stacks')
}
