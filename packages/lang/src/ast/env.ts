import {WithLog} from '../log'
import type {BaseNode, Node} from './ast'

type Arg = Record<string, Node>

export class Env {
	#outer!: Env | undefined
	#arg: Arg
	#evalCache: WeakMap<BaseNode, WithLog> = new WeakMap()
	#inferCache: WeakMap<BaseNode, WithLog> = new WeakMap()
	readonly isGlobal!: boolean

	private constructor(original: Env | undefined, arg: Arg) {
		this.#outer = original
		this.#arg = arg
		this.isGlobal = !original
	}

	push(arg: Arg) {
		return new Env(this, arg)
	}

	pop() {
		return this.#outer ?? this
	}

	get(name: string): Node | undefined {
		return this.#arg[name]
	}

	extend(arg: Arg) {
		return new Env(this, arg)
	}

	memoizeEval(ast: BaseNode, evaluate: () => WithLog): WithLog {
		let cache = this.#evalCache.get(ast)
		if (!cache) {
			this.#evalCache.set(ast, (cache = evaluate()))
		}
		return cache
	}

	memoizeInfer(ast: BaseNode, infer: () => WithLog): WithLog {
		let cache = this.#inferCache.get(ast)
		if (!cache) {
			this.#inferCache.set(ast, (cache = infer()))
		}
		return cache
	}

	static global = new Env(undefined, {})
}
