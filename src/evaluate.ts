import {Ast, isScope, List, Scope, Sym, Type, Unit} from './ast'
import {Env} from './env'
import {Global, GlobalEnv} from './global'

const EvalCache = new WeakMap<
	Exclude<Ast, number | string | null | boolean | typeof Unit>,
	WeakMap<Env, Ast>
>()

export function evaluate(ast: Ast, env: Env = GlobalEnv): Ast {
	if (
		ast === null ||
		ast === Unit ||
		typeof ast === 'number' ||
		typeof ast === 'string' ||
		typeof ast === 'boolean' ||
		typeof ast === 'function'
	) {
		return ast
	}

	if (EvalCache.has(ast)) {
		const envCache = EvalCache.get(ast)!
		if (env && envCache.has(env)) {
			return envCache.get(env)!
		}
	}

	let result: Ast

	if (Array.isArray(ast)) {
		result = ast.map(a => evaluate(a, env))
	} else {
		switch (ast[Type]) {
			case 'Prim':
				result = ast.value
				break
			case 'Sym':
				result = evaluateSymbol(ast, env)
				break
			case 'List':
				result = evaluateList(ast, env)
				break
			case 'Scope':
				result = evaluateScope(ast, env)
				break
		}
	}

	if (!EvalCache.has(ast)) {
		EvalCache.set(ast, new WeakMap())
	}

	EvalCache.get(ast)!.set(env, result)

	return result
}

function evaluateSymbol(ast: Sym, env: Env): Ast {
	const resolved = resolveSymbol(ast.name, env)
	return evaluate(resolved, env)
}

function evaluateList(ast: List, env: Env): Ast {
	const [fn, ...args] = ast.items
	const fnValue = evaluate(fn, env)
	if (typeof fnValue !== 'function') {
		throw new Error('Not a function')
	}
	return fnValue(...args.map(arg => evaluate(arg, env)))
}

function evaluateScope(ast: Scope, env: Env): Ast {
	return ast.ret ? evaluate(ast.ret, env) : Unit
}

function resolveSymbol(name: string, env: Env): Ast {
	if (isScope(env.ast) && env.ast.vars[name] !== undefined) {
		return env.ast.vars[name]
	}

	if (env.parent) {
		return resolveSymbol(name, env.parent)
	}

	if (Global.vars[name] !== undefined) {
		return Global.vars[name]
	}

	throw new Error(`Undefined variable: ${name}`)
}
