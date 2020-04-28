import {MalVal, LispError, symbolFor as S, isSymbol} from './types'

type Binds = (string | Binds)[]

export default class Env {
	public data: {
		[key: string]: MalVal
	} = {}

	public outer: Env | null
	private exprs?: MalVal[]

	public name = 'let'

	constructor(outer: Env | null = null, binds?: Binds, exprs?: MalVal[]) {
		this.data = {}
		this.outer = outer

		if (exprs) {
			this.exprs = exprs
		}

		if (binds && exprs) {
			this.bindAll(binds, exprs)
		}
	}

	public bindAll(binds: Binds, exprs: MalVal[]) {
		// Returns a new Env with symbols in binds bound to
		// corresponding values in exprs
		if (isSymbol(binds)) {
			this.data[binds] = exprs
		} else {
			for (let i = 0; i < binds.length; i++) {
				if (binds[i] === S('&')) {
					// variable length arguments
					this.data[binds[i + 1] as string] = exprs.slice(i)
					break
				}
				if (Array.isArray(binds[i])) {
					if (Array.isArray(exprs[i])) {
						this.bindAll(binds[i] as Binds, exprs[i] as MalVal[])
					} else {
						throw new LispError(
							`Error: destruction parameter ['${(binds[i] as string[])
								.map(s => s.slice(1))
								.join(' ')}'] is not specified as list`
						)
					}
				} else if (exprs[i] === undefined) {
					throw new LispError(
						`Error: parameter '${binds[i].slice(1)}' is not specified`
					)
				} else {
					this.data[binds[i] as string] = exprs[i]
				}
			}
		}
	}

	public set(key: string, value: MalVal) {
		// if (!isSymbol(key)) {
		// 	throw 'SET not symbol' + key
		// }
		this.data[key] = value
		return value
	}

	public find(key: string): MalVal | void {
		// if (!isSymbol(key)) {
		// 	throw 'FIND not symbol'
		// }

		// eslint-disable-next-line no-prototype-builtins
		if (this.data.hasOwnProperty(key)) {
			return this.data[key]
		} else if (
			key[1] === '%' &&
			this.exprs &&
			this.exprs.length >= (parseInt(key.slice(2)) || 0)
		) {
			const index = parseInt(key.slice(1)) || 0
			return this.exprs[index]
		} else if (this.outer !== null) {
			return this.outer.find(key)
		} else {
			return undefined
		}
	}

	public hasOwn(key: string) {
		if (!isSymbol(key)) {
			throw 'HASOWN not symbol'
		}
		// eslint-disable-next-line no-prototype-builtins
		return this.data.hasOwnProperty(key)
	}

	public get(key: string): MalVal {
		if (!isSymbol(key)) {
			throw 'get not symbol'
		}
		const value = this.find(key)

		if (value === undefined) {
			throw new LispError(`Symbol '${key.slice(1)}' not found`)
		}

		return value
	}
}
