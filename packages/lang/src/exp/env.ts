import type {Exp} from './exp'

type Arg = Record<string, Exp>

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

	get(name: string): Exp | undefined {
		return this.#arg[name]
	}

	static from(arg: Arg) {
		return new Env(undefined, arg)
	}
}
