import {MalVal, LispError} from './types'

function toKey(key: symbol | string): string {
	return typeof key === 'symbol' ? key.description || '' : key
}

export default class Env {
	public data: {
		[key: string]: MalVal
	} = {}

	public outer: Env | null
	private exprs?: MalVal[]

	public name = 'let'

	constructor(
		outer: Env | null = null,
		binds?: Array<symbol>,
		exprs?: MalVal[]
	) {
		this.data = {}
		this.outer = outer

		if (exprs) {
			this.exprs = exprs
		}

		if (binds && exprs) {
			// Returns a new Env with symbols in binds bound to
			// corresponding values in exprs
			for (let i = 0; i < binds.length; i++) {
				if (binds[i].description === '&') {
					// variable length arguments
					this.data[toKey(binds[i + 1])] = Array.prototype.slice.call(exprs, i)
					break
				}
				if (exprs[i] === undefined) {
					throw new LispError(
						`Error: parameter '${toKey(binds[i])}' is not specified`
					)
				}
				this.data[toKey(binds[i])] = exprs[i]
			}
		}
	}

	public set(key: symbol | string, value: MalVal) {
		key = toKey(key)

		this.data[key] = value
		return value
	}

	public find(key: symbol | string): MalVal | void {
		key = toKey(key)

		// eslint-disable-next-line no-prototype-builtins
		if (this.data.hasOwnProperty(key)) {
			return this.data[key]
		} else if (
			key.startsWith('%') &&
			this.exprs &&
			this.exprs.length >= (parseInt(key.slice(1)) || 0)
		) {
			const index = parseInt(key.slice(1)) || 0
			return this.exprs[index]
		} else if (this.outer !== null) {
			return this.outer.find(key)
		} else {
			return undefined
		}
	}

	public hasOwn(key: symbol | string) {
		key = toKey(key)
		// eslint-disable-next-line no-prototype-builtins
		return this.data.hasOwnProperty(key)
	}

	public get(key: symbol | string): MalVal {
		key = toKey(key)

		const value = this.find(key)

		if (value === undefined) {
			throw new LispError(`Symbol '${key}' not found`)
		}

		return value
	}
}
