import {printExpr} from './print'
import {
	Expr,
	ExprBind,
	ExprMap,
	ExprSeq,
	ExprSymbol,
	getType,
	GlispError,
	isMap,
	isSeq,
	isSymbol,
	symbolFor,
} from './types'

export default class Env {
	private data = new Map<string, Expr>()

	/**
	 * Stores a definition expression `(devar sym val)` for each symbol
	 */
	private defs = new Map<string, ExprSeq>()

	private bindings!: Env[]
	private exps?: Expr[]

	constructor(
		protected outer: Env | null = null,
		binds?: ExprBind,
		exps?: Expr[],
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

	public bindAll(binds: ExprBind, exps: Expr[]) {
		// Returns a new Env with symbols in binds bound to
		// corresponding values in exps
		if (isSymbol(binds)) {
			this.set(binds, exps)
		} else {
			for (let i = 0; i < binds.length; i++) {
				const bind = binds[i]
				const exp = exps[i]

				const bindType = getType(bind)

				if (bindType === 'symbol' && (bind as ExprSymbol).value === '&') {
					// rest arguments
					this.set(binds[i + 1] as ExprSymbol, exps.slice(i))
					i++
					continue
				}

				switch (bindType) {
					case 'symbol': {
						if (exp === undefined) {
							throw new GlispError(
								`[${this.name}] parameter '${bind}' is not specified`
							)
						}
						this.set(bind as ExprSymbol, exp)
						break
					}
					case 'vector': {
						// List Destruction
						if (!isSeq(exp)) {
							throw new GlispError(
								`[${this.name}] The destruction parameter ${printExpr(
									bind
								)} is not specified as sequence`
							)
						}

						this.bindAll(bind as ExprBind, exp as Expr[])
						break
					}
					case 'map': {
						// Hashmap destruction
						if (!isMap(exp)) {
							throw new GlispError(
								`[${this.name}] The destruction parameter '${printExpr(
									bind
								)}'} is not specified as map`
							)
						}
						// Convert the two maps to list
						// binds: [name location] <-- exps: ["Baku" "Japan"]
						const hashBinds = [] as ExprBind,
							hashExps = []

						for (const [key, sym] of Object.entries(bind)) {
							if (!(key in (exp as ExprMap))) {
								throw new GlispError(
									`[${this.name}] The destruction keyword :${key.slice(
										1
									)} does not exist on the parameter`
								)
							}
							hashBinds.push(sym)
							hashExps.push((exp as ExprMap)[key])
						}

						this.bindAll(hashBinds, hashExps)
						break
					}
					default:
						throw new GlispError(`[${this.name}] Invalid bind expression`)
				}
			}
		}
	}

	public set(symbol: ExprSymbol, value: Expr, def?: ExprSeq) {
		this.data.set(symbol.value, value)
		if (def) {
			this.defs.set(symbol.value, def)
		}
		return value
	}

	public getDef(symbol: ExprSymbol): ExprSeq | null {
		if (this.defs.has(symbol.value)) {
			return this.defs.get(symbol.value) as ExprSeq
		}

		if (this.outer !== null) {
			return this.outer.getDef(symbol)
		}

		return null
	}

	public find(symbol: ExprSymbol): Expr | void {
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

	public hasOwn(symbol: ExprSymbol) {
		return this.data.has(symbol.value)
	}

	public get(symbol: ExprSymbol): Expr {
		const value = this.find(symbol)

		if (value === undefined) {
			const callStacks = this.getChain()
				.map(env => env.name)
				.join(' -> ')
			throw new GlispError(
				`[${this.name}] Symbol ${symbol.value} not found\n${callStacks}`
			)
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
