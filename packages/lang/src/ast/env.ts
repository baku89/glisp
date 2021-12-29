import {WithLog} from '../log'
import type {Node} from './ast'

type Arg = Record<string, Node>

export class Env {
	#outer!: Env | undefined
	#arg: Arg
	#evaluated: WeakMap<Node, WithLog> = new WeakMap()
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

	memoizeEval(ast: Node, evaluate: () => WithLog): WithLog {
		let evaluated = this.#evaluated.get(ast)
		if (!evaluated) {
			evaluated = evaluate()
			this.#evaluated.set(ast, evaluated)
		}
		return evaluated
	}

	static global = new Env(undefined, {})
}
