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
	| MalMap
	| MalFn
	| MalMacro
	| MalAtom

abstract class MalBase<T> {
	parent: {ref: MalColl; index: number} | undefined

	readonly value: T
	protected _meta?: MalMap | MalNil

	protected constructor(value: T, meta?: MalMap | MalNil) {
		this.value = value

		if (meta) {
			this._meta = meta
		}
	}

	get meta() {
		return this._meta ? this._meta : (this._meta = MalNil.create())
	}

	set evaluated(_: MalVal) {
		undefined
	}
	get evaluated(): MalVal {
		return this as any
	}

	abstract readonly type: MalType

	abstract print(): string
	abstract clone(deep?: boolean): MalBase<T>
	abstract toJS(): any
	abstract equals(v: MalVal): boolean
}

// Primitives
abstract class MalPrimBase<
	T extends number | string | boolean | null
> extends MalBase<T> {

	equals(v: MalVal) {
		return v.type === this.type && v.value === this.value
	}
}

export class MalNumber extends MalPrimBase<number> {
	readonly type = MalType.Number

	protected constructor(v: number, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'number') throw new Error()
	}

	print() {
		return this.value.toFixed(4).replace(/\.?[0]+$/, '')
	}

	clone() {
		return new MalNumber(this.value)
	}

	toJS() {
		return this.value
	}

	static create(v = 0) {
		return new this(v)
	}

	static is(v: MalVal): v is MalNumber {
		return v.type === MalType.Number
	}
}

export class MalString extends MalPrimBase<string> {
	readonly type = MalType.String

	protected constructor(v: string, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'string') throw new Error()
	}

	get(index: number) {
		return new MalString(this.value[index])
	}

	print() {
		return `"${this.value}"`
	}

	clone() {
		return new MalString(this.value, this._meta?.clone())
	}

	toJS() {
		return this.value
	}

	get count() {
		return this.value.length
	}

	static create(v = '') {
		return new this(v)
	}

	static is(v: MalVal): v is MalString {
		return v.type === MalType.String
	}
}

export class MalBoolean extends MalPrimBase<boolean> {
	readonly type = MalType.Boolean

	protected constructor(v: any, meta?: MalMap | MalNil) {
		super(!!v, meta)
	}

	print() {
		return this.value ? 'true' : 'false'
	}

	clone() {
		return new MalBoolean(this.value, this._meta?.clone())
	}

	toJS() {
		return this.value
	}

	static create(v = true) {
		return new this(v)
	}

	static is(v: MalVal): v is MalBoolean {
		return v.type === MalType.Boolean
	}
}


export class MalKeyword extends MalPrimBase<string> {
	readonly type = MalType.Keyword

	protected constructor(v: string, meta?: MalMap | MalNil) {
		super(v, meta)
		if (typeof v !== 'string') throw new Error()
	}

	print() {
		return ':' + this.value
	}

	clone() {
		return new MalKeyword(this.value, this._meta?.clone())
	}

	toJS() {
		return this.value
	}

	static create(v = '_') {
		return new this(v)
	}

	static is(v: MalVal): v is MalKeyword {
		return v.type === MalType.Keyword
	}

	static isFor(v: MalVal, name: string): v is MalSymbol {
		return v.type === MalType.Keyword && v.value === name
	}
}

export class MalNil extends MalPrimBase<null> {
	readonly type = MalType.Nil
	readonly value = null

	protected constructor(_: null, meta?: MalMap | MalNil) {
		super(null, meta)
	}

	print() {
		return 'nil'
	}

	clone(): MalNil {
		return new MalNil(null, this._meta?.clone())
	}

	toJS() {
		return null
	}

	static create() {
		return new this(null)
	}

	static is(v: MalVal): v is MalNil {
		return v.type === MalType.Nil
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
		return this.value
	}

	clone() {
		return new MalSymbol(this.value, this._meta?.clone())
	}

	toJS() {
		return this.value
	}

	static create(v = '_') {
		return new this(v)
	}

	static is(v: MalVal): v is MalSymbol {
		return v.type === MalType.Symbol
	}

	static isFor(v: MalVal, name: string): v is MalSymbol {
		return v.type === MalType.Symbol && v.value === name
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
				this.value.length === 0
					? ['']
					: ['', ...Array(this.value.length - 1).fill(' '), '']
		}
		return this._delimiters
	}

	protected printValues() {
		const delimiters = this.delimiters
		let str = delimiters[0]
		for (let i = 0; i < this.value.length; i++) {
			str += this.value[i].print() + delimiters[i + 1]
		}
		return str
	}

	toJS() {
		this.value.map(x => x.toJS())
	}

	equals(v: MalVal): boolean {
		return (
			v.type === this.type &&
			v.value.length === this.value.length &&
			v.value.every((x, i) => x.equals(this.value[i]))
		)
	}

	// Inherited from MalCollBase
	get(index: number) {
		return this.value[index]
	}

	get count() {
		return this.value.length
	}
}

export class MalList extends MalSeqBase {
	readonly type = MalType.List
	sugar?: string

	print() {
		return '(' + this.printValues() + ')'
	}

	clone(deep = false): MalList {
		const value = deep ? this.value.map(v => v.clone(true)) : [...this.value]
		return new MalList(value, this._meta?.clone())
	}

	// Original methods
	get first() {
		return this.value[0] || MalNil.create()
	}

	get rest() {
		return this.value.slice(1)
	}

	static create(v: MalVal[] = []) {
		return new this(v)
	}

	static is(v: MalVal): v is MalList {
		return v.type === MalType.List
	}

	static isCallOf(v: MalVal, name: string): v is MalList {		
		return v.type === MalType.List && MalSymbol.isFor(v.first, name)
	}
}

const v = MalList.create()


export class MalVector extends MalSeqBase {
	readonly type = MalType.Vector

	print() {
		return '[' + this.printValues() + ']'
	}

	clone(deep = false): MalVector {
		const value = deep ? this.value.map(v => v.clone(true)) : [...this.value]
		return new MalVector(value, this._meta?.clone())
	}

	static create(v: MalVal[] = []) {
		return new this(v)
	}

	static is(v: MalVal): v is MalVector {
		return v.type === MalType.Vector
	}
}

export class MalMap extends MalCollBase<MalMapValue> {
	readonly type = MalType.Map
	protected _delimiters: string[] | undefined

	print() {
		const entries = this.entries()
		const delimiters = this.delimiters

		let str = ''
		for (let i = 0; i < entries.length; i++) {
			const [k, v] = entries[i]
			str += delimiters[2 * i + 1] + `:${k}` + delimiters[2 * i + 2] + v.print()
		}
		str += delimiters[delimiters.length - 1]

		return '{' + str + '}'
	}

	clone(deep = false): MalMap {
		const value: MalMapValue = deep
			? Object.fromEntries(this.entries().map(([k, v]) => [k, v.clone(true)]))
			: {...this.value}
		return new MalMap(value, this._meta?.clone())
	}

	toJS(): {[k: string]: any} {
		return Object.fromEntries(
			Object.entries(this.value).map(([k, v]) => [k, v.toJS()])
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

	get(key: string) {
		return this.value[key]
	}

	get count() {
		return Object.keys(this.value).length
	}

	// Original methods
	entries() {
		return Object.entries(this.value)
	}

	keys() {
		return Object.keys(this.value)
	}

	values() {
		return Object.values(this.value)
	}

	assoc(pairs: MalVal[]) {
		return new MalMap({...this.value, ...MalMap.createValue(pairs)})
	}

	// Static Functions
	static create(v: MalMapValue) {
		return new this(v)
	}

	static fromSeq(pairs: MalVal[]) {
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

	static is(v: MalVal): v is MalMap {
		return v.type === MalType.Map
	}
}

// Callable
export interface MalCallableContext {
	callerEnv: Env
}
export type MalCallableValue = (...params: MalVal[]) => MalVal

abstract class MalCallable extends MalBase<MalCallableValue> {
	abstract readonly type: MalType.Fn | MalType.Macro

	equals(v: MalVal): boolean {
		return v.type === this.type && v.value === this.value
	}

	print(): string {
		if (this.ast) {
			return `(${
				this.type
			} ${this.ast.params.print()} ${this.ast.body.print()})`
		} else {
			return `(${this.type} #<JS Function>)`
		}
	}

	toJS() {
		return this.value
	}

	public ast?: {
		body: MalVal
		params: MalVector
		env: Env
	}
}

export class MalFn extends MalCallable {
	readonly type = MalType.Fn

	clone(): MalFn {
		return new MalFn(this.value, this._meta?.clone())
	}

	static create(v: MalCallableValue) {
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

	static is(v: MalVal): v is MalFn {
		return v.type === MalType.Fn
	}
}

export class MalMacro extends MalCallable {
	readonly type = MalType.Macro

	clone(): MalMacro {
		return new MalMacro(this.value, this._meta?.clone())
	}

	static create(v: MalCallableValue) {
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

	static is(v: MalVal): v is MalMacro {
		return v.type === MalType.Fn
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
		return new MalAtom(this.value.clone(), this._meta?.clone())
	}

	print(readably = true): string {
		return `(atom ${this.value?.print(readably)})readably`
	}

	toJS(): any {
		return this.value.toJS()
	}

	equals(v: MalVal) {
		return v.type === this.type && v.value === this.value
	}

	static create(value: MalVal) {
		return new MalAtom(value)
	}

	static is(value: MalVal | undefined): value is MalAtom {
		return value?.type === MalType.Atom
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