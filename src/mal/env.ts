import {
	MalVal,
	LispError,
	symbolFor as S,
	isSymbol,
	isMap,
	MalMap,
	MalSymbol,
	MalBind
} from './types'
import {printExp} from '.'

export default class Env {
	private data: {
		[key: string]: MalVal
	} = {}
	private bindings!: Env[]
	private exps?: MalVal[]

	public name = 'let'

	constructor(
		protected outer: Env | null = null,
		binds?: MalBind,
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

	protected getMergedData() {
		const data = (this.outer?.getMergedData() || {}) as {[k: string]: MalVal}
		return {...data, ...this.data}
	}

	public getAllSymbols() {
		return Object.keys(this.getMergedData())
	}

	public bindAll(binds: MalBind, exps: MalVal[]) {
		// Returns a new Env with symbols in binds bound to
		// corresponding values in exps
		if (isSymbol(binds)) {
			this.set(binds, exps)
		} else {
			for (let i = 0; i < binds.length; i++) {
				const bind = binds[i]
				// Variable length arguments
				if (isSymbol(bind) && bind.value === '&') {
					this.set(binds[i + 1] as MalSymbol, exps.slice(i))
					break
				}

				if (Array.isArray(bind)) {
					// List Destruction
					if (!Array.isArray(exps[i])) {
						throw new LispError(
							`Error: destruction parameter ${printExp(
								bind,
								true,
								false
							)} is not specified as list`
						)
					}

					this.bindAll(bind as MalBind, exps[i] as MalVal[])
				} else if (isMap(bind)) {
					// Hashmap destruction
					if (!isMap(exps[i])) {
						throw new LispError(
							`Error: destruction parameter '${printExp(
								bind,
								true,
								false
							)}'} is not specified as map`
						)
					}
					// Convert the two maps to list
					// binds: [name location] <-- exps: ["Baku" "Japan"]
					const entries = Object.entries(bind),
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
					throw new LispError(`Error: parameter '${bind}' is not specified`)
				} else {
					this.set(bind, exps[i])
				}
			}
		}
	}

	public set(symbol: MalSymbol, value: MalVal) {
		this.data[symbol.value] = value
		return value
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

		// eslint-disable-next-line no-prototype-builtins
		if (this.data.hasOwnProperty(symbol.value)) {
			return this.data[symbol.value]
		}

		let argIndex
		if (
			symbol.value[0] === '%' &&
			this.exps &&
			this.exps.length >= (argIndex = parseInt(symbol.value.slice(1)) || 0)
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
		// eslint-disable-next-line no-prototype-builtins
		return this.data.hasOwnProperty(symbol.value)
	}

	public get(symbol: MalSymbol): MalVal {
		// if (!isSymbol(symbol)) {
		// 	throw 'get not symbol'
		// }

		const value = this.find(symbol)

		if (value === undefined) {
			throw new LispError(`Symbol ${symbol} not found`)
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
