import {
	MalVal,
	MalError,
	MalSymbol,
	MalMap,
	isMalSeq,
	MalType,
	MalVector, MalKeyword
} from './types'
import {printExp} from '.'

export default class Env {
	private data = new Map<string, MalVal>()

	private bindings!: Env[]
	private exps?: MalVal

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
			this.set(binds, exps)
		} else if (MalVector.is(binds)) {
			if (!MalVector.is(exps)) {
				throw new MalError('Bind vector error')
			}

			for (let i = 0; i < binds.value.length; i++) {
				const bind = binds.value[i]
				const exp = exps.value[i]

				const bindType = bind.type

				if (MalSymbol.isFor(bind, '&')) {
					// rest arguments
					this.set(
						binds.value[i + 1] as MalSymbol,
						MalVector.create(...exps.value.slice(i))
					)
					i++
					continue

				} else if ( MalKeyword.isFor(bind, 'as')) {
					// :as destruction
					this.set(binds.value[i + 1] as MalSymbol, exp)
					break
				}

				this.bindAll(bind, exp)

				switch (bindType) {
					case MalType.Symbol: {
						if (exp === undefined) {
							throw new MalError(
								`[${this.name}] parameter '${bind}' is not specified`
							)
						}
						this.set(bind as MalSymbol, exp)
						break
					}
					case MalType.Vector: {
						// List Destruction
						if (!isMalSeq(exp)) {
							throw new MalError(
								`[${this.name}] The destruction parameter ${printExp(
									bind,
									true
								)} is not specified as sequence`
							)
						}

						this.bindAll(bind as MalVal, exp as MalVal[])
						break
					}
					case MalType.Map: {
						// Hashmap destruction
						if (!MalMap.is(exp)) {
							throw new MalError(
								`[${this.name}] The destruction parameter '${printExp(
									bind,
									true
								)}'} is not specified as map`
							)
						}
						// Convert the two maps to list
						// binds: [name location] <-- exps: ["Baku" "Japan"]
						const hashBinds = [] as MalVal,
							hashExps = []

						for (const [key, sym] of Object.entries(bind)) {
							if (key === keywordFor('as')) {
								// :as destruction
								hashBinds.push(sym)
								hashExps.push(exp)
							} else {
								if (!(key in (exp as MalMap))) {
									throw new MalError(
										`[${this.name}] The destruction keyword :${key.slice(
											1
										)} does not exist on the parameter`
									)
								}
								hashBinds.push(sym)
								hashExps.push((exp as MalMap)[key])
							}
						}

						this.bindAll(hashBinds, hashExps)
						break
					}
					default:
						throw new MalError(`[${this.name}] Invalid bind expression`)
				}
			}
		} else if (MalMap.is(binds)) {
			if (!MalMap.is(exps)) {
				throw new MalError('Bind map error')
			}

			for (Mal)
		}
	}

	public set(symbol: MalSymbol, value: MalVal) {
		this.data.set(symbol.value, value)
		return value
	}

	public find(symbol: MalSymbol): MalVal | void {
		// First, search binding
		const bindings = this.root.bindings
		if (bindings.length > 0) {
			const bindingEnv = bindings[bindings.length - 1]
			const value = bindingEnv.find(symbol)
			if (value !== undefined) {
				return value
			}
		}

		if (this.data.has(symbol.value)) {
			return this.data.get(symbol.value)
		}

		let argIndex
		if (
			symbol.value[0] === '%' &&
			this.exps &&
			this.exps.length >= (argIndex = parseInt(symbol.value.slice(1)) - 1 || 0)
		) {
			return this.exps[argIndex]
		}

		if (this.outer !== null) {
			return this.outer.find(symbol)
		}

		return undefined
	}

	public hasOwn(symbol: MalSymbol) {
		// if (!MalSymbol.is(symbol)) {
		// 	throw 'HASOWN not symbol'
		// }
		return this.data.has(symbol.value)
	}

	public get(symbol: MalSymbol): MalVal {
		// if (!MalSymbol.is(symbol)) {
		// 	throw 'get not symbol'
		// }

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
