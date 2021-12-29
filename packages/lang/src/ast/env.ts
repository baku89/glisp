import type {Node} from './ast'

type Arg = Record<string, Node>

export class Env {
	#original!: Env | undefined
	#arg: Arg

	private constructor(original: Env | undefined, arg: Arg) {
		this.#original = original
		this.#arg = arg
	}

	push(arg: Arg) {
		return new Env(this, arg)
	}

	pop() {
		return this.#original
	}

	get(name: string): Node | undefined {
		return this.#arg[name]
	}

	static extend(env: Env | undefined, arg: Arg) {
		return new Env(env, arg)
	}
}
