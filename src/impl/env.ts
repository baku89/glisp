import {MalVal} from './types'

function toKey(key: symbol | string): string {
	return typeof key === 'symbol' ? key.description || '' : key
}

export default class Env {
	public data: {
		[key: string]: MalVal
	} = {}

	public outer: Env | null

	public name = 'let'

	constructor(
		outer: Env | null = null,
		binds?: Array<symbol>,
		exprs?: MalVal[]
	) {
		this.data = {}
		this.outer = outer

		if (binds && exprs) {
			// Returns a new Env with symbols in binds bound to
			// corresponding values in exprs
			// TODO: check types of binds and exprs and compare lengths
			for (let i = 0; i < binds.length; i++) {
				if (binds[i].description === '&') {
					// variable length arguments
					this.data[toKey(binds[i + 1])] = Array.prototype.slice.call(exprs, i)
					break
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
		} else if (this.outer !== null) {
			return this.outer.find(key)
		} else {
			return undefined
		}
	}

	public get(key: symbol | string): MalVal | void {
		key = toKey(key)

		const value = this.find(key)

		if (value === undefined) {
			throw new Error(`Symbol '${key}' not found`)
		}

		return value
	}
}
