import {printExp} from '.'
import {
	getType,
	isMap,
	isSeq,
	isSymbol,
	keywordFor,
	MalBind,
	MalError,
	MalMap,
	MalSeq,
	MalSymbol,
	MalType,
	MalVal,
	symbolFor,
} from './types'

export default class Env {
	private data = new Map<string, MalVal>()

	/**
	 * Stores a definition expression `(devar sym val)` for each symbol
	 */
	private defs = new Map<string, MalSeq>()

	private bindings!: Env[]
	private exps?: MalVal[]

	constructor(
		protected outer: Env | null = null,
		binds?: MalBind,
		exps?: MalVal[],
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
		return Array.from(merged.keys()).map(v => symbolFor(v))
	}

	public bindAll(binds: MalBind, exps: MalVal[]) {
		// Returns a new Env with symbols in binds bound to
		// corresponding values in exps
		if (isSymbol(binds)) {
			this.set(binds, exps)
		} else {
			for (let i = 0; i < binds.length; i++) {
				const bind = binds[i]
				const exp = exps[i]

				const bindType = getType(bind)

				if (bindType === MalType.Symbol && (bind as MalSymbol).value === '&') {
					// rest arguments
					this.set(binds[i + 1] as MalSymbol, exps.slice(i))
					i++
					continue
				} else if (bind === keywordFor('as')) {
					// :as destruction
					this.set(binds[i + 1] as MalSymbol, [...exps])
					break
				}

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
						if (!isSeq(exp)) {
							throw new MalError(
								`[${this.name}] The destruction parameter ${printExp(
									bind,
									true
								)} is not specified as sequence`
							)
						}

						this.bindAll(bind as MalBind, exp as MalVal[])
						break
					}
					case MalType.Map: {
						// Hashmap destruction
						if (!isMap(exp)) {
							throw new MalError(
								`[${this.name}] The destruction parameter '${printExp(
									bind,
									true
								)}'} is not specified as map`
							)
						}
						// Convert the two maps to list
						// binds: [name location] <-- exps: ["Baku" "Japan"]
						const hashBinds = [] as MalBind,
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
		}
	}

	public set(symbol: MalSymbol, value: MalVal, def?: MalSeq) {
		this.data.set(symbol.value, value)
		if (def) {
			this.defs.set(symbol.value, def)
		}
		return value
	}

	public getDef(symbol: MalSymbol): MalSeq | null {
		// eslint-disable-next-line no-prototype-builtins
		if (this.defs.has(symbol.value)) {
			return this.defs.get(symbol.value) as MalSeq
		}

		if (this.outer !== null) {
			return this.outer.getDef(symbol)
		}

		return null
	}

	public find(symbol: MalSymbol): MalVal | void {
		// if (!isSymbol(symbol)) {
		// 	throw 'FIND not symbol'
		// }

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
		// if (!isSymbol(symbol)) {
		// 	throw 'HASOWN not symbol'
		// }
		return this.data.has(symbol.value)
	}

	public get(symbol: MalSymbol): MalVal {
		// if (!isSymbol(symbol)) {
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
