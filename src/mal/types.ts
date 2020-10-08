import Env from './env'

export enum MalType {
	// Collections
	List = 'list',
	Vector = 'vector',
	Map = 'map',

	// Atoms
	Number = 'number',
	String = 'string',
	Boolean = 'boolean',
	Nil = 'nil',
	Symbol = 'symbol',
	Keyword = 'keyword',
	Atom = 'atom',

	// Functions
	Func = 'fn',
	Macro = 'macro',
}

export type MalConvertable =
	| number
	| string
	| boolean
	| null
	| MalVal
	| MalF
	| MalConvertable[]
	| {[key: string]: MalConvertable}

export abstract class MalVal {
	parent: {ref: MalColl; index: number} | undefined
	protected _meta: MalMap | MalNil | undefined

	get meta(): MalMap | MalNil {
		return this._meta ? this._meta : (this._meta = MalNil.create())
	}

	withMeta(meta: MalVal) {
		if (MalNil.is(meta)) {
			// Nothing has changed
			return this
		}

		if (!MalMap.is(meta)) {
			throw new MalError('Metadata must be Map')
		}

		const v = this.clone(false)
		v._meta = MalMap.is(this._meta)
			? MalMap.create({...this._meta.value, ...meta.value})
			: MalMap.create()

		return v
	}

	set evaluated(v: MalVal) {
		null
	}
	get evaluated(): MalVal {
		return this
	}

	abstract type: MalType
	abstract readonly value: any
	abstract clone(deep?: boolean): MalVal
	abstract print(readably?: boolean): string
	abstract toJS(): MalConvertable

	equals(x: MalVal) {
		return this.type === x.type && this.value === x.value
	}

	toString() {
		this.print(true)
	}
}

export class MalNumber extends MalVal {
	readonly type: MalType.Number = MalType.Number

	private constructor(public readonly value: number) {
		super()
	}

	toJS() {
		return this.value
	}

	print() {
		return this.value.toFixed(4).replace(/\.?[0]+$/, '')
	}

	clone() {
		const v = new MalNumber(this.value)
		v._meta = this._meta?.clone()
		return v
	}

	static is(value: MalVal | undefined): value is MalNumber {
		return value?.type === MalType.Number
	}

	static create(value: number) {
		if (typeof value !== 'number') throw new MalError(`Cannot create MalNumber from the value ${value}`)
		return new MalNumber(value)
	}
}

export class MalString extends MalVal {
	readonly type: MalType.String = MalType.String

	private constructor(public readonly value: string) {
		super()
	}

	print(readably = true) {
		return readably
			? '"' +
					this.value
						.replace(/\\/g, '\\\\')
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n') +
					'"'
			: this.value
	}

	toJS() {
		return this.value
	}

	clone() {
		const v = new MalString(this.value)
		v._meta = this._meta?.clone()
		return v
	}

	static is(value: MalVal | undefined): value is MalString {
		return value?.type === MalType.String
	}

	static create(value: string) {
		return new MalString(value)
	}
}

export class MalBoolean extends MalVal {
	readonly type: MalType.Boolean = MalType.Boolean

	private constructor(public readonly value: boolean) {
		super()
	}

	print() {
		return this.value.toString()
	}

	toJS() {
		return this.value
	}

	clone() {
		const v = new MalBoolean(this.value)
		v._meta = this._meta?.clone()
		return v
	}

	static is(value: MalVal | undefined): value is MalBoolean {
		return value?.type === MalType.Boolean
	}

	static create(value: boolean) {
		return new MalBoolean(!!value)
	}
}

export class MalNil extends MalVal {
	readonly type: MalType.Nil = MalType.Nil
	readonly value = null

	private constructor() {
		super()
	}

	print() {
		return 'nil'
	}

	toJS() {
		return null
	}

	clone() {
		const v = new MalNil()
		v._meta = this._meta?.clone()
		return v
	}

	static is(value: MalVal | undefined): value is MalNil {
		return value?.type === MalType.Nil
	}

	static create() {
		return new MalNil()
	}
}

export class MalKeyword extends MalVal {
	readonly type: MalType.Keyword = MalType.Keyword

	private constructor(public readonly value: string) {
		super()
	}

	print() {
		return ':' + this.value
	}

	toJS() {
		return this
	}

	clone() {
		const v = new MalKeyword(this.value)
		v._meta = this._meta?.clone()
		return v
	}

	static is(value: MalVal | undefined): value is MalKeyword {
		return value?.type === MalType.Keyword
	}

	static create(name: string) {
		if (typeof name !== 'string') throw new MalError(`Cannot create MalString from the value ${name}`)
		return new MalKeyword(name)
	}

	static isFor(value: MalVal, name: string) {
		return value?.type === MalType.Keyword && value.value === name
	}
}

export class MalList extends MalVal {
	readonly type: MalType.List = MalType.List

	private _delimiters: string[] | undefined
	public str: string | undefined
	public sugar: string | undefined

	private _evaluated: MalVal | undefined

	constructor(public readonly value: MalVal[]) {
		super()
	}

	set evaluated(value: MalVal) {
		this._evaluated = value
	}

	get evaluated(): MalVal {
		return this._evaluated || this
	}

	get fn() {
		return this.value[0]
	}

	get params() {
		return this.value.slice(1)
	}

	get length() {
		return this.value.length
	}

	set delimiters(v: string[]) {
		this._delimiters = v
	}

	get delimiters(): string[] {
		if (!this._delimiters) {
			this._delimiters =
				this.value.length === 0
					? ['']
					: ['', ...Array(this.value.length - 1).fill(' '), '']
		}
		return this._delimiters
	}

	print(readably = true) {
		if (this.str === undefined) {
			const delimiters = this.delimiters

			if (this.sugar) {
				let str = this.sugar
				for (let i = 1; i < this.value.length; i++) {
					str += delimiters[i - 1] +  this.value[i]?.print(readably)
				}
				return str
			} else {
				let str = delimiters[0]
				for (let i = 0; i < this.value.length; i++) {
					str += this.value[i]?.print(readably) + delimiters[i + 1]
				}
				return `(${str})`
			}
		}

		return this.str
	}

	toJS() {
		return this
	}

	get(index: number) {
		return this.value[index]
	}

	clone(deep = true) {
		const list = new MalList(deep ? this.value.map(v => v.clone()) : this.value)
		if (this.delimiters) {
			list.delimiters = [...this.delimiters]
		}
		list.str = this.str
		list._meta = this._meta?.clone()
		return list
	}

	equals(x: MalVal) {
		return MalList.is(x) && x.value.every((v, i) => this.value[i].equals(v))
	}

	static isCallOf(list: MalVal, symbol: string): list is MalList {
		return MalList.is(list) && MalSymbol.isFor(list.value[0], symbol)
	}

	static is(value: MalVal | undefined): value is MalList {
		return value?.type === MalType.List
	}

	static create(...value: MalVal[]) {
		return new MalList(value)
	}
}

export class MalVector extends MalVal {
	readonly type: MalType.Vector = MalType.Vector

	private _delimiters: string[] | undefined
	public str: string | undefined
	private _evaluated: MalVector | undefined

	constructor(public readonly value: MalVal[]) {
		super()
	}

	set evaluated(value: MalVector) {
		this._evaluated = value
	}

	get evaluated(): MalVector {
		return this._evaluated || this
	}

	set delimiters(v: string[]) {
		this._delimiters = v
	}

	get delimiters(): string[] {
		if (!this._delimiters) {
			this._delimiters =
				this.value.length === 0
					? ['']
					: ['', ...Array(this.value.length - 1).fill(' '), '']
		}
		return this._delimiters
	}

	get(index: number) {
		return this.value[index]
	}

	get length() {
		return this.value.length
	}

	print(readably = true) {
		if (this.str === undefined) {
			const delimiters = this.delimiters
			let str = delimiters[0]
			for (let i = 0; i < this.value.length; i++) {
				str += this.value[i]?.print(readably) + delimiters[i + 1]
			}

			this.str = '[' + str + ']'
		}

		return this.str
	}

	toJS() {
		return this.value.map(x => x.toJS())
	}

	toFloats() {
		return new Float32Array(this.value.map(x => x.value) as number[])
	}

	clone(deep = true) {
		const list = new MalVector(
			deep ? this.value.map(v => v.clone()) : this.value
		)
		if (this.delimiters) {
			list.delimiters = [...this.delimiters]
		}
		list.str = this.str
		list._meta = this._meta?.clone()
		return list
	}

	equals(x: MalVal) {
		return MalVector.is(x) && x.value.every((v, i) => this.value[i].equals(v))
	}

	static is(value: MalVal | undefined): value is MalVector {
		return value?.type === MalType.Vector
	}

	static create(...value: MalVal[]) {
		return new MalVector(value)
	}
}

export class MalMap extends MalVal {
	readonly type: MalType.Map = MalType.Map

	private _delimiters: string[] | undefined
	public str: string | undefined
	public _evaluated: MalMap | undefined

	constructor(readonly value: {[key: string]: MalVal}) {
		super()
	}

	set evaluated(value: MalMap) {
		this._evaluated = value
	}

	get evaluated(): MalMap {
		return this._evaluated || this
	}

	get(key: string | number) {
		return this.value[typeof key === 'string' ? key : this.keys()[key]]
	}

	set delimiters(v: string[]) {
		this._delimiters = v
	}

	get delimiters(): string[] {
		let delimiters = this._delimiters
		if (!delimiters) {
			const size = this.entries().length
			delimiters = this._delimiters =
				size === 0 ? [''] : ['', ...Array(size * 2 - 1).fill(' '), '']
		}
		return delimiters
	}

	print(readably = true) {
		if (this.str === undefined) {
			const entries = this.entries()

			const delimiters = this.delimiters

			let str = ''
			for (let i = 0; i < entries.length; i++) {
				const [k, v] = entries[i]
				str +=
					delimiters[2 * i + 1] +
					`:${k}` +
					delimiters[2 * i + 2] +
					v?.print(readably)
			}
			str += delimiters[delimiters.length - 1]

			this.str = '{' + str + '}'
		}

		return this.str
	}

	toJS() {
		const ret: {[key: string]: any} = {}
		this.entries().forEach(([k, v]) => {
			ret[k] = v.toJS()
		})
		return ret
	}

	clone(deep = true) {
		const v = new MalMap(
			deep
				? Object.fromEntries(this.entries().map(([k, v]) => [k, v.clone()]))
				: {...this.value}
		)
		v.delimiters = [...this.delimiters]
		v.str = this.str
		v._meta = this._meta?.clone()
		return v
	}

	entries() {
		return Object.entries(this.value)
	}

	keys() {
		return Object.keys(this.value)
	}

	values() {
		return Object.values(this.value)
	}

	assoc(...pairs: MalVal[]) {
		return MalMap.create({...this.value, ...MalMap.createValue(pairs)})
	}

	equals(x: MalVal) {
		return (
			MalMap.is(x) && x.entries().every(([k, v]) => this.value[k].equals(v))
		)
	}

	static is(value: MalVal | undefined): value is MalMap {
		return value?.type === MalType.Map
	}

	static create(value: {[key: string]: MalVal} = {}) {
		return new MalMap(value)
	}

	private static createValue(coll: MalVal[]) {
		const map: {[key: string]: MalVal} = {}

		for (let i = 0; i + 1 < coll.length; i += 2) {
			const k = coll[i]
			const v = coll[i + 1]
			if (MalKeyword.is(k) || MalString.is(k)) {
				map[k.value] = v
			} else {
				throw new MalError(
					`Unexpected key ${k.print()}, expected: keyword or string`
				)
			}
		}

		return map
	}

	static fromMalSeq(...coll: MalVal[]) {
		return new MalMap(this.createValue(coll))
	}
}

export interface MalFuncThis {
	callerEnv: Env
}

export type MalF = (
	// this: MalFuncThis | void,
	...args: MalVal[]
) => MalVal

export class MalFunc extends MalVal {
	readonly type: MalType = MalType.Func

	exp!: MalVal | undefined
	env!: Env
	params!: MalVal[]

	private constructor(public value: MalF) {
		super()
	}

	print() {
		if (this.exp) {
			return `(fn [${this.params
				.map(x => x.print())
				.join(' ')}] ${this.exp.print()})`
		} else {
			return `#<JS Function>`
		}
	}

	toJS() {
		return this.value
	}

	clone() {
		const f = new MalFunc(this.value)
		f.exp = this.exp?.clone()
		f.env = this.env
		f.params = this.params.map(x => x.clone())
		f._meta = this.meta.clone()
		return f
	}

	static is(value: MalVal | undefined): value is MalFunc {
		return value?.type === MalType.Func
	}

	static create(value: MalF, meta?: MalMap) {
		const f = new MalFunc(value)
		f._meta = meta
		return f
	}

	static fromMal(func: MalF, exp: MalVal, env: Env, params: MalVal[] = []) {
		const f = new MalFunc(func)
		f.exp = exp
		f.env = env
		f.params = params
		return f
	}
}

export class MalMacro extends MalVal {
	readonly type = MalType.Macro

	exp!: MalVal | undefined
	env!: Env
	params!: MalVal[]

	private constructor(public value: MalF) {
		super()
	}

	print() {
		if (this.exp) {
			return `(macro [${this.params
				.map(x => x.print())
				.join(' ')}] ${this.exp.print()})`
		} else {
			return `#<JS Macro>`
		}
	}

	toJS() {
		return this.value
	}

	clone() {
		const f = new MalMacro(this.value)
		f.exp = this.exp?.clone()
		f.env = this.env
		f.params = this.params.map(x => x.clone())
		f._meta = this.meta.clone()
		return f
	}

	static create(value: MalF, meta?: MalMap) {
		const f = new MalMacro(value)
		f._meta = meta
		return f
	}

	static fromMal(func: MalF, exp: MalVal, env: Env, params: MalVal[]) {
		const m = new MalMacro(func)
		m.exp = exp
		m.env = env
		m.params = params
		return m
	}

	static is(value: MalVal | undefined): value is MalFunc {
		return value?.type === MalType.Macro
	}
}

export class MalError extends Error {}

export class MalSymbol extends MalVal {
	public readonly type: MalType.Symbol = MalType.Symbol
	private _def!: MalSeq | undefined
	private _evaluated!: MalVal | undefined

	private constructor(public readonly value: string) {
		super()
	}

	set evaluated(value: MalVal) {
		this._evaluated = value
	}

	get evaluated(): MalVal {
		return this._evaluated || this
	}

	set def(def: MalSeq | undefined) {
		this._def = def
	}

	get def(): MalSeq | undefined {
		return this._def || undefined
	}

	print() {
		return this.value
	}

	toJS() {
		return this
	}

	clone() {
		return new MalSymbol(this.value)
	}

	static create(identifier: string) {
		return new MalSymbol(identifier)
	}

	static is(value: MalVal | undefined): value is MalSymbol {
		return value?.type === MalType.Symbol
	}

	static isFor(value: MalVal, name: string) {
		return value?.type === MalType.Symbol && value.value === name
	}
}

export class MalAtom extends MalVal {
	public readonly type: MalType.Atom = MalType.Atom
	public constructor(public value: MalVal) {
		super()
	}

	get evaluated() {
		return this.value
	}

	clone() {
		return new MalAtom(this.value.clone())
	}

	print(readably = true): string {
		return `(atom ${this.value?.print(readably)})readably`
	}

	toJS() {
		return this.value.toJS()
	}

	static is(value: MalVal | undefined): value is MalAtom {
		return value?.type === MalType.Atom
	}
}

// Union Types
export type MalColl = MalList | MalVector | MalMap
export type MalSeq = MalList | MalVector

// Predicates
export const isMalColl = (value: MalVal | undefined): value is MalColl => {
	const type = value?.type
	return (
		type === MalType.List || type === MalType.Map || type === MalType.Vector
	)
}

export const isMalSeq = (value: MalVal | undefined): value is MalSeq => {
	const type = value?.type
	return type === MalType.Vector || type === MalType.List
}
