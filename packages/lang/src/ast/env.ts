import {WithLog} from '../log'
import type {Arg, BaseNode} from './ast'

type ArgDict = Record<string, Arg>

export class Env {
	#outer!: Env | undefined
	#arg: ArgDict
	#evalCache: WeakMap<BaseNode, WithLog> = new WeakMap()
	#inferCache: WeakMap<BaseNode, WithLog> = new WeakMap()
	readonly isGlobal!: boolean

	private constructor(original: Env | undefined, arg: ArgDict) {
		this.#outer = original
		this.#arg = arg
		this.isGlobal = !original
	}

	push(arg: ArgDict) {
		return new Env(this, arg)
	}

	pop() {
		return this.#outer ?? this
	}

	get(name: string): Arg | undefined {
		return this.#arg[name]
	}

	extend(arg: ArgDict) {
		return new Env(this, arg)
	}

	memoizeEval(ast: BaseNode, evaluate: (env: Env) => WithLog): WithLog {
		let cache = this.#evalCache.get(ast)
		if (!cache) {
			this.#evalCache.set(ast, (cache = evaluate(this)))
		}
		return cache
	}

	memoizeInfer(ast: BaseNode, infer: (env: Env) => WithLog): WithLog {
		let cache = this.#inferCache.get(ast)
		if (!cache) {
			this.#inferCache.set(ast, (cache = infer(this)))
		}
		return cache
	}

	static global = new Env(undefined, {})
}
