import {
	MalVal,
	MalError,
	MalSymbol,
	MalMap,
	MalVector,
	MalKeyword,
} from './types'

export default class Env {
	private data = new Map<string, MalVal>()

	private bindings: Env[] = []

	public outer!: Env | null
	public readonly name!: string

	constructor({
		outer = null,
		name = 'let',
		forms,
		exps,
	}: {
		outer?: Env | null
		name?: string
		forms?: MalVal[]
		exps?: MalVal[]
	} = {}) {
		this.outer = outer
		this.name = name

		if (forms && exps) {
			console.log('reduce!!', forms, exps)
			this.bind(MalVector.create(forms), MalVector.create(exps))
		}
	}

	protected root(): Env {
		if (this.outer) {
			return this.outer.root()
		} else {
			return this
		}
	}

	public getAllSymbols() {
		const merged = this.outer
			? new Map({...this.outer.data, ...this.data})
			: this.data
		return [...merged.keys()].map(MalSymbol.create)
	}

	/**
	 * Returns a new Env with symbols in binds bound to
	 * corresponding values in exps
	 */
	public bind(forms: MalVal, exps: MalVal | undefined) {
		if (MalSymbol.is(forms)) {
			if (!exps) {
				throw new MalError(
					`[${this.name}] parameter '${forms.print()}' is not specified`
				)
			}
			this.set(forms.value, exps)
		} else if (MalVector.is(forms)) {
			if (!MalVector.is(exps)) {
				throw new MalError(
					`[${
						this.name
					}] The destruction parameter ${forms.print()} is not specified as vector`
				)
			}

			for (let i = 0; i < forms.value.length; i++) {
				const form = forms.value[i]
				const exp = exps.value[i]

				if (MalSymbol.isFor(form, '&')) {
					// rest arguments
					this.set(
						(forms.value[i + 1] as MalSymbol).value,
						MalVector.create(exps.value.slice(i))
					)
					i++
					continue
				} else if (MalKeyword.isFor(form, 'as')) {
					// :as destruction
					this.set((forms.value[i + 1] as MalSymbol).value, exp)
					break
				}

				this.bind(form, exp)
			}
		} else if (MalMap.is(forms)) {
			if (!MalMap.is(exps)) {
				throw new MalError(
					`[${
						this.name
					}] The destruction parameter ${forms.print()} is not specified as map`
				)
			}

			for (const [key, form] of forms.entries()) {
				if (key === 'as') {
					// :as destruction
					if (!MalSymbol.is(form)) throw new MalError('Invalid :as')
					this.set(form.value, exps)
					continue
				} else {
					if (!(key in exps.value)) {
						throw new MalError(
							`[${this.name}] The destruction keyword :${key} does not exist on the parameter`
						)
					}
					this.bind(form, exps.value[key])
				}
			}
		}
	}

	public set(symbol: string, value: MalVal) {
		this.data.set(symbol, value)
		return value
	}

	protected find(symbol: string): MalVal | undefined {
		// First, search binding
		const bindings = this.root().bindings
		if (bindings.length > 0) {
			const bindingEnv = bindings[bindings.length - 1]
			const value = bindingEnv.find(symbol)
			if (value !== undefined) {
				return value
			}
		}

		// Seek in current env
		if (this.data.has(symbol)) {
			return this.data.get(symbol)
		}

		if (this.outer !== null) {
			return this.outer.find(symbol)
		}
	}

	public hasOwn(symbol: string) {
		return this.data.has(symbol)
	}

	public get(symbol: string): MalVal {
		const value = this.find(symbol)

		if (value === undefined) {
			throw new MalError(`[${this.name}] Use of undeclared symbol ${symbol}`)
		}

		return value
	}

	public getChain() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let _env: Env | null = this
		const envs = [...this.root().bindings.reverse()]

		do {
			envs.push(_env)
			_env = _env.outer
		} while (_env)

		return envs
	}

	public pushBinding(env: Env) {
		const bindings = this.root().bindings
		const outer = bindings.length > 0 ? bindings[bindings.length - 1] : null
		env.outer = outer
		bindings.push(env)
		return env
	}

	public popBinding() {
		this.root().bindings.pop()
	}
}
