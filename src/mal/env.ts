import {
	MalVal,
	LispError,
	symbolFor as S,
	isSymbol,
	isMap,
	MalMap
} from './types'

type Binds = (string | Binds)[]

export default class Env {
	private data: {
		[key: string]: MalVal
	} = {}
	private bindings!: Env[]
	private exps?: MalVal[]

	public name = 'let'

	constructor(
		protected outer: Env | null = null,
		binds?: Binds,
		exps?: MalVal[]
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

	public bindAll(binds: Binds, exps: MalVal[]) {
		// Returns a new Env with symbols in binds bound to
		// corresponding values in exps
		if (isSymbol(binds)) {
			this.set(binds, exps)
		} else {
			for (let i = 0; i < binds.length; i++) {
				// Variable length arguments
				if (binds[i] === S('&')) {
					this.set(binds[i + 1] as string, exps.slice(i))
					break
				}

				if (Array.isArray(binds[i])) {
					// List Destruction
					if (!Array.isArray(exps[i])) {
						throw new LispError(
							`Error: destruction parameter [${(binds[i] as string[])
								.map(s => s.slice(1))
								.join(' ')}] is not specified as list`
						)
					}

					this.bindAll(binds[i] as Binds, exps[i] as MalVal[])
				} else if (isMap(binds[i])) {
					// Hashmap destruction
					if (!isMap(exps[i])) {
						throw new LispError(
							`Error: destruction parameter {'${(binds[i] as string[])
								.map(s => s.slice(1))
								.join(' ')}'} is not specified as map`
						)
					}
					// Convert the two maps to list
					// binds: [name location] <-- exps: ["Baku" "Japan"]
					const entries = Object.entries(binds[i]) as [string, string][],
						hashBinds = [],
						hashExps = []

					for (const [key, sym] of entries) {
						if (!(key in (exps[i] as MalMap))) {
							throw new LispError(
								`ERROR: destruction keyword :${key.slice(
									1
								)} does not exist on the parameter`
							)
						}
						hashBinds.push(sym)
						hashExps.push((exps[i] as MalMap)[key])
					}

					this.bindAll(hashBinds, hashExps)
				} else if (exps[i] === undefined) {
					throw new LispError(
						`Error: parameter '${binds[i].slice(1)}' is not specified`
					)
				} else {
					this.set(binds[i] as string, exps[i])
				}
			}
		}
	}

	public set(key: string, value: MalVal) {
		this.data[key] = value
		return value
	}

	public find(key: string): MalVal | void {
		// if (!isSymbol(key)) {
		// 	throw 'FIND not symbol'
		// }

		// First, search binding
		const bindings = this.root.bindings
		if (bindings.length > 0) {
			const bindingEnv = bindings[bindings.length - 1]
			const value = bindingEnv.find(key)
			if (value !== undefined) {
				return value
			}
		}

		// eslint-disable-next-line no-prototype-builtins
		if (this.data.hasOwnProperty(key)) {
			return this.data[key]
		}

		let argIndex
		if (
			key[1] === '%' &&
			this.exps &&
			this.exps.length >= (argIndex = parseInt(key.slice(2)) || 0)
		) {
			return this.exps[argIndex]
		}

		if (this.outer !== null) {
			return this.outer.find(key)
		}

		return undefined
	}

	public hasOwn(key: string) {
		// if (!isSymbol(key)) {
		// 	throw 'HASOWN not symbol'
		// }
		// eslint-disable-next-line no-prototype-builtins
		return this.data.hasOwnProperty(key)
	}

	public get(key: string): MalVal {
		// if (!isSymbol(key)) {
		// 	throw 'get not symbol'
		// }
		const value = this.find(key)

		if (value === undefined) {
			throw new LispError(`Symbol '${key.slice(1)}' not found`)
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

	public pushBinding() {
		const bindings = this.root.bindings
		const outer = bindings.length > 0 ? bindings[bindings.length - 1] : null
		const env = new Env(outer)
		env.name = 'binding'
		bindings.push(env)
		return env
	}

	public popBinding() {
		this.root.bindings.pop()
	}
}
