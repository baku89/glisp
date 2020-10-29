import Env from './env'

export enum MalType {
	Number = 'number',
	String = 'string',
	Boolean = 'boolean',
	Symbol = 'symbol',
	Keyword = 'keyword',
	Nil = 'nil',

	List = 'list',
	Vector = 'vector',
	Map = 'map',

	Buffer = 'buffer',

	Fn = 'fn',
	Macro = 'macro',

	Atom = 'atom',
}

export type MalVal =
	| MalNumber
	| MalString
	| MalBoolean
	| MalSymbol
	| MalKeyword
	| MalNil
	| MalList
	| MalVector
	| MalBuffer
	| MalMap
	| MalFn
	| MalMacro
	| MalAtom

abstract class MalBase<T> {
	parent: {ref: MalColl; index: number} | undefined

	protected _value: T
	protected _meta?: MalMap | MalNil

	protected constructor(value: T, meta?: MalMap | MalNil) {
		this._value = value

		if (meta) {
			this._meta = meta
		}
	}

	withMeta(meta: MalVal) {
		const v = this.clone()

		switch (meta.type) {
			case MalType.Nil:
				break
			case MalType.Map:
				v._meta = meta
				break
			case MalType.Keyword:
			case MalType.String:
				v._meta = MalMap.of([meta, MalBoolean.from(true)])
				break
			default:
				throw new Error('Metadata must be Symbol, Keyword, String or Map')
		}

		return v
	}

	get meta() {
		return this._meta ? this._meta : (this._meta = MalNil.from())
	}

	get value() {
		return this._value
	}

	set evaluated(_: MalVal) {
		undefined
	}
	get evaluated(): MalVal {
		return this as any
	}

	toFloats(): Float32Array {
		throw new MalError('Cannot create array buffer')
	}

	toBoolean(): boolean {
		return !!this._value
	}

	abstract readonly type: MalType

	abstract print(readably?: boolean): string
	abstract clone(deep?: boolean): MalBase<T>
	abstract toObject(): any
	abstract equals(v: MalVal): boolean
}

// Primitives
abstract class MalPrimBase<
	T extends number | string | boolean | null
> extends MalBase<T> {
	equals(v: MalVal) {
		return v?.type === this.type && v.value === this._value
	}
}

export class MalNumber extends MalPrimBase<number> {
	readonly type = MalType.Number

	protected constructor(v: number, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'number') throw new Error()
	}

	print() {
		return this._value.toFixed(4).replace(/\.?[0]+$/, '')
	}

	clone() {
		return new MalNumber(this._value)
	}

	toObject() {
		return this._value
	}

	static from(v = 0) {
		return new this(v)
	}

	static is(v: MalVal | undefined): v is MalNumber {
		return v?.type === MalType.Number
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a number`)
		return v.value
	}
}

export class MalString extends MalPrimBase<string> {
	readonly type = MalType.String

	protected constructor(v: string, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'string') throw new Error()
	}

	get(index: number) {
		return new MalString(this._value[index])
	}

	print(readably = true) {
		return readably
			? '"' +
					this._value
						.replace(/\\/g, '\\\\')
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n') +
					'"'
			: this._value
	}

	clone() {
		return new MalString(this._value, this._meta?.clone())
	}

	toObject() {
		return this._value
	}

	get count() {
		return this._value.length
	}

	static from(v = '') {
		return new this(v)
	}

	static is(v: MalVal | undefined): v is MalString {
		return v?.type === MalType.String
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a string`)
		return v.value
	}
}

export class MalBoolean extends MalPrimBase<boolean> {
	readonly type = MalType.Boolean

	protected constructor(v: any, meta?: MalMap | MalNil) {
		super(!!v, meta)
	}

	print() {
		return this._value ? 'true' : 'false'
	}

	clone() {
		return new MalBoolean(this._value, this._meta?.clone())
	}

	toObject() {
		return this._value
	}

	static from(v = true) {
		return new this(v)
	}

	static is(v: MalVal | undefined): v is MalBoolean {
		return v?.type === MalType.Boolean
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v))
			throw new MalError(`${label || v.print()} is not a boolean`)
		return v.value
	}
}

// eslint-disable-next-line no-useless-escape
const SymbolKeywordRegex = /^[:0-9()\[\]{}@^~'`,#\\]|[;\s]/

export class MalKeyword extends MalPrimBase<string> {
	readonly type = MalType.Keyword

	protected constructor(v: string, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'string') throw new Error()
	}

	print() {
		return ':' + this._value
	}

	clone() {
		return new MalKeyword(this._value, this._meta?.clone())
	}

	toObject() {
		return this._value
	}

	static from(v = '_') {
		if (SymbolKeywordRegex.test(v))
			throw new MalError(`Cannot create a keyword with name "${v}"`)
		return new this(v)
	}

	static is(v: MalVal | undefined): v is MalKeyword {
		return v?.type === MalType.Keyword
	}

	static isFor(v: MalVal, name: string): v is MalSymbol {
		return v?.type === MalType.Keyword && v.value === name
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v))
			throw new MalError(`${label || v.print()} is not a keyword`)
		return v.value
	}
}

export class MalNil extends MalPrimBase<null> {
	readonly type = MalType.Nil

	protected constructor(_: null, meta?: MalMap | MalNil) {
		super(null, meta)
	}

	print() {
		return 'nil'
	}

	clone(): MalNil {
		return new MalNil(null, this._meta?.clone())
	}

	toObject() {
		return null
	}

	static from() {
		return new this(null)
	}

	static is(v: MalVal | undefined): v is MalNil {
		return v?.type === MalType.Nil
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not nil`)
		return v.value
	}
}

export class MalSymbol extends MalPrimBase<string> {
	readonly type = MalType.Symbol
	private _evaluated?: MalVal

	set evaluated(v: MalVal) {
		this._evaluated = v
	}
	get evaluated() {
		return this._evaluated || this
	}

	protected constructor(v: string, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'string') throw new Error()
	}

	print() {
		return this._value
	}

	clone() {
		return new MalSymbol(this._value, this._meta?.clone())
	}

	toObject() {
		return this._value
	}

	static from(v = '_') {
		if (SymbolKeywordRegex.test(v))
			throw new MalError(`Cannot create a symbol with name "${v}"`)
		return new this(v)
	}

	static is(v: MalVal | undefined): v is MalSymbol {
		return v?.type === MalType.Symbol
	}

	static isFor(v: MalVal, name: string): v is MalSymbol {
		return v?.type === MalType.Symbol && v.value === name
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a symbol`)
		return v.value
	}
}

// Collections
export type MalMapValue = {[key: string]: MalVal}

abstract class MalCollBase<T extends MalVal[] | MalMapValue> extends MalBase<
	T
> {
	private _evaluated?: MalVal

	set evaluated(v: MalVal) {
		this._evaluated = v
	}
	get evaluated() {
		return this._evaluated || (this as any)
	}

	abstract get count(): number
}

abstract class MalSeqBase extends MalCollBase<MalVal[]> {
	abstract readonly type: MalType.List | MalType.Vector
	protected _delimiters: string[] | undefined

	set delimiters(v: string[]) {
		this._delimiters = v
	}

	get delimiters(): string[] {
		if (!this._delimiters) {
			this._delimiters =
				this._value.length === 0
					? ['']
					: ['', ...Array(this._value.length - 1).fill(' '), '']
		}
		return this._delimiters
	}

	protected printValues(readably: boolean) {
		const delimiters = this.delimiters
		let str = delimiters[0]
		for (let i = 0; i < this._value.length; i++) {
			str += this._value[i].print(readably) + delimiters[i + 1]
		}
		return str
	}

	toObject(): any[] {
		return this._value.map(x => x.toObject())
	}

	equals(v: MalVal): boolean {
		return (
			v.type === this.type &&
			v.value.length === this._value.length &&
			v.value.every((x, i) => x.equals(this._value[i]))
		)
	}

	// Inherited from MalCollBase
	get(index: number) {
		return this._value[index]
	}

	get count() {
		return this._value.length
	}

	// Array manipulation
	slice(start?: number, end?: number) {
		return this._value.slice(start, end)
	}

	map(callbackfn: (value: MalVal, index: number, array: MalVal[]) => any) {
		return this._value.map(callbackfn)
	}

	forEach(callbackfn: (value: MalVal, index: number, array: MalVal[]) => void) {
		this._value.forEach(callbackfn)
	}
}

export class MalList extends MalSeqBase {
	readonly type = MalType.List
	sugar?: string

	print(readably = true) {
		if (this.sugar) {
			const delimiters = this.delimiters
			let str = this.sugar
			for (let i = 1; i < this._value.length; i++) {
				str += delimiters[i] + this._value[i].print(readably)
			}
			return str
		} else {
			return '(' + this.printValues(readably) + ')'
		}
	}

	clone(deep = false): MalList {
		const value = deep ? this._value.map(v => v.clone(true)) : [...this._value]
		return new MalList(value, this._meta?.clone())
	}

	// Original methods
	get first() {
		return this._value[0] || MalNil.from()
	}

	get rest() {
		return this._value.slice(1)
	}

	// Static functions
	static from(v: MalVal[] = []) {
		return new this(v)
	}

	static of(...xs: MalVal[]) {
		return new this(xs)
	}

	static is(v: MalVal | undefined): v is MalList {
		return v?.type === MalType.List
	}

	static isCallOf(v: MalVal, name: string): v is MalList {
		return v?.type === MalType.List && MalSymbol.isFor(v.first, name)
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a list`)
		return v.value
	}
}

export class MalVector extends MalSeqBase {
	readonly type = MalType.Vector

	print(readably = true) {
		return '[' + this.printValues(readably) + ']'
	}

	clone(deep = false): MalVector {
		const value = deep ? this._value.map(v => v.clone(true)) : [...this._value]
		return new MalVector(value, this._meta?.clone())
	}

	// Original methods
	toFloats() {
		const arr: any[] = this._value.map(x => x.value)
		return new Float32Array(arr)
	}

	// Static functions
	static from(v: MalVal[] = []) {
		return new this(v)
	}

	static of(...xs: MalVal[]) {
		return new this(xs)
	}

	static is(v: MalVal | undefined): v is MalVector {
		return v?.type === MalType.Vector
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a vector`)
		return v.value
	}
}

export class MalBuffer extends MalBase<Float32Array | Uint8Array> {
	readonly type = MalType.Buffer

	print() {
		return '#F[' + this._value.join(' ') + ']'
	}

	clone() {
		const value = new Float32Array(this._value)
		return new MalBuffer(value, this._meta?.clone())
	}

	get count() {
		return this._value.length
	}

	toFloats() {
		return this._value instanceof Float32Array
			? this._value
			: Float32Array.from(this._value)
	}

	get(index: number) {
		return MalNumber.from(this._value[index])
	}

	get bufferType() {
		if (this._value instanceof Float32Array) {
			return 'f32'
		} else {
			return 'u8'
		}
	}

	equals(v: MalVal): boolean {
		return (
			v.type === this.type &&
			v.count === this.count &&
			v.bufferType === this.bufferType &&
			v.value.every((x: number, i: number) => x === this._value[i])
		)
	}

	toObject() {
		return this._value
	}

	static from(value: Float32Array | Uint8Array) {
		return new this(value)
	}

	static is(value: MalVal | undefined): value is MalBuffer {
		return value?.type === MalType.Buffer
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a buffer`)
		return v.value
	}
}

export class MalMap extends MalCollBase<MalMapValue> {
	readonly type = MalType.Map
	protected _delimiters: string[] | undefined

	print(readably = true) {
		const entries = this.entries()
		const delimiters = this.delimiters

		let str = ''
		for (let i = 0; i < entries.length; i++) {
			const [k, v] = entries[i]
			str +=
				delimiters[2 * i] + `:${k}` + delimiters[2 * i + 1] + v.print(readably)
		}
		str += delimiters[delimiters.length - 1]

		return '{' + str + '}'
	}

	clone(deep = false): MalMap {
		const value: MalMapValue = deep
			? Object.fromEntries(this.entries().map(([k, v]) => [k, v.clone(true)]))
			: {...this._value}
		return new MalMap(value, this._meta?.clone())
	}

	toObject(): {[k: string]: any} {
		return Object.fromEntries(
			Object.entries(this._value).map(([k, v]) => [k, v.toObject()])
		)
	}

	equals(v: MalVal): boolean {
		if (v.type !== this.type) return false

		const keys = Object.keys(v.value)
		return (
			keys.length === this.keys().length &&
			keys.every(k => v.get(k).equals(this.get(k)))
		)
	}

	// Inherited from MalCollBase
	set delimiters(v: string[]) {
		this._delimiters = v
	}
	get delimiters() {
		if (!this._delimiters) {
			const count = this.count
			this._delimiters = this._delimiters =
				count === 0 ? [''] : ['', ...Array(count * 2 - 1).fill(' '), '']
		}
		return this._delimiters
	}

	get(key: string | number) {
		return this._value[typeof key === 'number' ? this.keys()[key] : key]
	}

	get count() {
		return Object.keys(this._value).length
	}

	// Original methods
	entries() {
		return Object.entries(this._value)
	}

	keys() {
		return Object.keys(this._value)
	}

	values() {
		return Object.values(this._value)
	}

	assoc(pairs: MalVal[]) {
		return new MalMap({...this._value, ...MalMap.createValue(pairs)})
	}

	// Static Functions
	static from(v: MalMapValue) {
		return new this(v)
	}

	static of(pairs: MalVal[]) {
		return new this(this.createValue(pairs))
	}

	private static createValue(pairs: MalVal[]) {
		const map: MalMapValue = {}

		for (let i = 0; i < pairs.length; i += 2) {
			const k = pairs[i]
			const v = pairs[i + 1]
			if (k.type === MalType.Keyword || k.type === MalType.String) {
				map[k.value] = v
			} else {
				throw new MalError(
					`Unexpected key ${k.print()}, expected keyword or string`
				)
			}
		}

		return map
	}

	static is(v: MalVal | undefined): v is MalMap {
		return v?.type === MalType.Map
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a map`)
		return v.value
	}
}

// Callable
export type MalCallableValue = (
	...params: MalVal[]
) => MalVal | Promise<MalVal> | never

abstract class MalCallable extends MalBase<MalCallableValue> {
	abstract readonly type: MalType.Fn | MalType.Macro

	equals(v: MalVal): boolean {
		return v?.type === this.type && v.value === this._value
	}

	print(readably = true): string {
		if (this.ast) {
			return `(${this.type} ${this.ast.params.print(
				readably
			)} ${this.ast.body.print(readably)})`
		} else {
			return `(${this.type} #<JS Function>)`
		}
	}

	toObject() {
		return this._value
	}

	public lazyFlags?: boolean[]

	public ast?: {
		body: MalVal
		params: MalVector
		env: Env
	}
}

export class MalFn extends MalCallable {
	readonly type = MalType.Fn

	clone() {
		const v = new MalFn(this._value, this._meta?.clone())
		v.ast = this.ast
		return v
	}

	static from(v: MalCallableValue) {
		return new this(v)
	}

	static fromLisp(
		f: MalCallableValue,
		ast: {body: MalVal; params: MalVector; env: Env}
	) {
		const v = new this(f)
		v.ast = ast
		return v
	}

	static is(v: MalVal | undefined): v is MalFn {
		return v?.type === MalType.Fn
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v))
			throw new MalError(`${label || v.print()} is not a function`)
		return v.value
	}
}

export class MalMacro extends MalCallable {
	readonly type = MalType.Macro

	clone() {
		const v = new MalMacro(this._value, this._meta?.clone())
		v.ast = this.ast
		return v
	}

	static from(v: MalCallableValue) {
		return new this(v)
	}

	static fromLisp(
		f: MalCallableValue,
		ast: {body: MalVal; params: MalVector; env: Env}
	) {
		const v = new this(f)
		v.ast = ast
		return v
	}

	static is(v: MalVal | undefined): v is MalMacro {
		return v?.type === MalType.Macro
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not a macro`)
		return v.value
	}
}

// Atom
export class MalAtom extends MalBase<MalVal> {
	readonly type = MalType.Atom
	private _evaluated?: MalVal

	set evaluated(v: MalVal) {
		this._evaluated = v
	}
	get evaluated() {
		return this._evaluated || this
	}

	clone(): MalAtom {
		return new MalAtom(this._value.clone(), this._meta?.clone())
	}

	print(readably = true): string {
		return `(atom ${this._value?.print(readably)})`
	}

	toObject(): any {
		return this._value.toObject()
	}

	equals(v: MalVal) {
		return v?.type === this.type && v.value === this._value
	}

	// Original methods
	set value(v: MalVal) {
		this._value = v
	}

	get value() {
		return this._value
	}

	static from(value: MalVal) {
		return new MalAtom(value)
	}

	static is(value: MalVal | undefined): value is MalAtom {
		return value?.type === MalType.Atom
	}

	static check(v: MalVal, label?: string) {
		if (!this.is(v)) throw new MalError(`${label || v.print()} is not an atom`)
		return v.value
	}
}

// Errors
export class MalError extends Error {}

// Union Types
export type MalColl = MalList | MalVector | MalMap
export type MalSeq = MalList | MalVector

export const isMal = (value: any): value is MalVal => {
	return typeof value?.type === 'string'
}

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
