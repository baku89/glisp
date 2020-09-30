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

	private bindings!: Env[]
	private exps?: MalVal[]

	constructor(
		protected outer: Env | null = null,
		binds?: MalVal,
		exps?: MalVal,
		public name = 'let'
	) {
		if (this.root === this) {
			this.bindings = []
		}

		if (exps) {
			this.exps = exps
		}

		if (binds && exps) {
			this.bindAll(binds, exps)
		}
	}

	protected get root(): Env {
		if (this.outer) {
			return this.outer.root
		} else {
			return this
		}
	}

	public getAllSymbols() {
		const merged = this.outer
			? new Map({...this.outer.data, ...this.data})
			: this.data
		return Array.from(merged.keys()).map(v => MalSymbol.create(v))
	}

	/**
	 * Returns a new Env with symbols in binds bound to
	 * corresponding values in exps
	 */
	public bindAll(binds: MalVal, exps: MalVal) {
		if (MalSymbol.is(binds)) {
			this.set(binds.value, exps)
		} else if (MalVector.is(binds)) {
			if (!MalVector.is(exps)) {
				throw new MalError('Bind vector error')
			}

			for (let i = 0; i < binds.value.length; i++) {
				const bind = binds.value[i]
				const exp = exps.value[i]

				if (MalSymbol.isFor(bind, '&')) {
					// rest arguments
					this.set(
						(binds.value[i + 1] as MalSymbol).value,
						MalVector.create(...exps.value.slice(i))
					)
					i++
					continue
				} else if (MalKeyword.isFor(bind, 'as')) {
					// :as destruction
					this.set((binds.value[i + 1] as MalSymbol).value, exp)
					break
				}

				this.bindAll(bind, exp)
			}
		} else if (MalMap.is(binds)) {
			if (!MalMap.is(exps)) {
				throw new MalError('Bind map error')
			}

			for (const [key, bind] of binds.entries()) {
				if (key === 'as') {
					// :as destruction
					if (!MalSymbol.is(bind)) throw new MalError('Invalid :as')
					this.set(bind.value, exps)
					continue
				} else {
					if (!(key in exps.value)) {
						throw new MalError(
							`[${this.name}] The destruction keyword :${key} does not exist on the parameter`
						)
					}
					this.bindAll(bind, exps.value[key])
				}
			}
		}
	}

	public set(symbol: string, value: MalVal) {
		this.data.set(symbol, value)
		return value
	}

	public find(symbol: string): MalVal | void {
		// First, search binding
		const bindings = this.root.bindings
		if (bindings.length > 0) {
			const bindingEnv = bindings[bindings.length - 1]
			const value = bindingEnv.find(symbol)
			if (value !== undefined) {
				return value
			}
		}

		if (this.data.has(symbol)) {
			return this.data.get(symbol)
		}

		let argIndex
		if (
			symbol.startsWith('%') &&
			this.exps &&
			this.exps.length >= (argIndex = parseInt(symbol.slice(1)) - 1 || 0)
		) {
			return this.exps[argIndex]
		}

		if (this.outer !== null) {
			return this.outer.find(symbol)
		}

		return undefined
	}

	public hasOwn(symbol: string) {
		return this.data.has(symbol)
	}

	public get(symbol: string): MalVal {
		const value = this.find(symbol)

		if (value === undefined) {
			throw new MalError(`[${this.name}] Symbol ${symbol} not found`)
		}

		return value
	}

	public getChain() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let _env: Env | null = this
		const envs = [...this.root.bindings.reverse()]

		do {
			envs.push(_env)
			_env = _env.outer
		} while (_env)

		return envs
	}

	public setOuter(outer: Env) {
		this.outer = outer
	}

	public pushBinding(env: Env) {
		const bindings = this.root.bindings
		const outer = bindings.length > 0 ? bindings[bindings.length - 1] : null
		env.name = 'binding'
		env.outer = outer
		bindings.push(env)
		return env
	}

	public popBinding() {
		this.root.bindings.pop()
	}
}
