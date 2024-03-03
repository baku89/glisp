import {Ast} from './ast'
import {isObject} from 'lodash'

import {Env} from './env'

export function evaluate(input: Ast, env: Env): Ast {
	if (
		input === null ||
		typeof input === 'number' ||
		typeof input === 'string' ||
		typeof input === 'boolean' ||
		typeof input === 'function'
	) {
		return input
	}

	if (input[Ast] === 'Sym') {
		return resolve(input.name, env)
	}

	if (input[Ast] === 'App') {
		const [fn, ...args] = input.items
		const fnValue = evaluate(fn, env)
		if (typeof fnValue !== 'function') {
			throw new Error('Not a function')
		}
		return fnValue(...args.map(arg => evaluate(arg, env)))
	}

	if (input[Ast] === 'Scope') {
		if (input.ret) {
			return evaluate(input.ret, {parent: env, ast: input})
		} else {
			return null
		}
	}

	throw new Error('Unknown ast type')
}

function resolve(name: string, env: Env): Ast {
	if (
		isObject(env.ast) &&
		typeof env.ast !== 'function' &&
		env.ast[Ast] === 'Scope' &&
		env.ast.vars[name] !== undefined
	) {
		return env.ast.vars[name]
	}

	if (env.parent) {
		return resolve(name, env.parent)
	}

	throw new Error(`Undefined variable: ${name}`)
}
