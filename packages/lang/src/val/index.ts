import {differenceWith, entries, isEqualWith, values} from 'lodash'

export type Value =
	| All
	| Bottom
	| Int
	| Bool
	| Fn
	| TyVar
	| TyFn
	| TyUnion
	| TyAtom
	| TySingleton

interface IVal {
	type: string
	print(): string
	convert(val: Value): Value
	isSubtypeOf(ty: Value): boolean
	isEqualTo(val: Value): boolean
}

export class All implements IVal {
	public readonly type: 'all' = 'all'

	private constructor() {
		return this
	}

	public print() {
		return 'All'
	}

	public convert() {
		return bottom
	}

	public isSubtypeOf(ty: Value) {
		return ty.type === 'all' || ty.type === 'tyVar'
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}

	public static instance = new All()
}

export const all = All.instance

export class Bottom implements IVal {
	public readonly type: 'bottom' = 'bottom'

	private constructor() {
		return this
	}

	public print() {
		return '_'
	}

	public convert() {
		return this
	}

	public isSubtypeOf() {
		return true
	}

	public isEqualTo(val: Value) {
		return val.type === this.type
	}

	public static instance = new Bottom()
}

export const bottom = Bottom.instance

export class Int implements IVal {
	public readonly type: 'int' = 'int'
	private superType = tyInt
	private constructor(public readonly value: number) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty === this.superType) return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return ty.type === 'int' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		return val.type === this.type && val.value === this.value
	}

	public static of(value: number) {
		return new Int(value)
	}
}

export const int = Int.of

const a = int(10)

export class Bool implements IVal {
	public readonly type: 'bool' = 'bool'
	private readonly superType = tyBool
	private constructor(public readonly value: boolean) {}

	public print() {
		return this.value.toString()
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty === this.superType) return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))

		return ty.type === 'bool' && ty.value === this.value
	}

	public isEqualTo(val: Value) {
		return val.type === this.type && val.value === this.value
	}

	public static of(value: boolean) {
		return new Bool(value)
	}
}

export const bool = Bool.of

export class Fn implements IVal {
	public readonly type: 'fn' = 'fn'
	public readonly tyParam!: Value[]
	public constructor(
		public readonly value: (...params: any[]) => Value,
		public readonly param: Record<string, Value>,
		public readonly out: Value
	) {
		this.tyParam = values(param)
	}

	public get tyOut() {
		return this.out
	}

	public print(): string {
		const params = entries(this.param)
			.map(([n, ty]) => n + ':' + ty.print())
			.join(' ')
		const out = this.out.print()
		return `(=> [${params}] <JS Function>:${out})`
	}

	public convert() {
		return this
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyFn') {
			const thisTy = tyFn(this.tyParam, this.out)
			return thisTy.isSubtypeOf(ty)
		}
		return this === ty
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.value === this.value &&
			isEqualWith(this.param, val.param, isEqual) &&
			this.out.isEqualTo(val.out)
		)
	}

	public static of(
		value: (...params: any[]) => Value,
		tyParam: Record<string, Value>,
		tyOut: Value
	) {
		return new Fn(value, tyParam, tyOut)
	}
}

export const fn = Fn.of

export class TyVar implements IVal {
	public readonly type: 'tyVar' = 'tyVar'

	private constructor(private readonly id: number = TyVar.counter++) {}

	public print() {
		return '<t' + this.id + '>'
	}

	public convert() {
		return bottom
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tyVar') return true //ty.id === this.id

		return false
	}

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.id === this.id
	}

	private static counter = 1

	public static fresh() {
		return new TyVar()
	}
}

export const tyVar = TyVar.fresh

export class TyFn implements IVal {
	public readonly type: 'tyFn' = 'tyFn'
	private constructor(
		public readonly tyParam: Value[],
		public readonly tyOut: Value
	) {}

	public print(): string {
		const param = this.tyParam.map(v => v.print()).join(' ')
		const out = this.tyOut.print()

		return `(-> [${param}] ${out})`
	}

	public convert(val: Value): Value {
		const outVal = this.tyOut.convert(val)

		return fn(() => outVal, {}, this.tyOut)
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type !== 'tyFn') return false

		const curParam = this.tyParam
		const tyParam = ty.tyParam

		if (curParam.length > tyParam.length) return false

		const isParamSubtype = curParam.every((cty, i) =>
			tyParam[i].isSubtypeOf(cty)
		)

		const isOutSubtype = this.tyOut.isSubtypeOf(ty.tyOut)

		return isParamSubtype && isOutSubtype
	}

	public isEqualTo(val: Value): boolean {
		return (
			val.type === this.type &&
			val.tyParam.length === this.tyParam.length &&
			val.tyParam.every((v, i) => v.isEqualTo(this.tyParam[i])) &&
			val.tyOut.isEqualTo(this.tyOut)
		)
	}

	public static of(param: Value[], out: Value) {
		return new TyFn(param, out)
	}
}

export const tyFn = TyFn.of

export class TyUnion implements IVal {
	public readonly type: 'tyUnion' = 'tyUnion'
	private constructor(public readonly types: Exclude<Value, TyUnion>[]) {
		if (types.length <= 1) throw new Error('Invalid union type')
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type !== 'tyUnion') return this.types.every(s => s.isSubtypeOf(ty))

		return this.types.every(s => ty.types.some(t => s.isSubtypeOf(t)))
	}

	public convert(val: Value): Value {
		return this.types[0].convert(val)
	}

	public print(): string {
		const types = this.types.map(t => t.print()).join(' ')
		return `(| ${types})`
	}

	public isEqualTo(val: Value): boolean {
		if (val.type !== this.type) return false
		if (val.types.length !== this.types.length) return false

		return differenceWith(val.types, this.types, isEqual).length === 0
	}

	public static fromTypesUnsafe(types: Value[]) {
		const flattenTypes = types.flatMap(ty =>
			ty.type === 'tyUnion' ? ty.types : ty
		)
		return new TyUnion(flattenTypes)
	}
}

export function uniteTy(...types: Value[]) {
	const flattenedTypes = types.flatMap(ty =>
		ty.type === 'tyUnion' ? ty.types : [ty]
	)

	const normalizedTypes = flattenedTypes.reduce((prev, ty) => {
		const index = prev.findIndex(p => p.isSubtypeOf(ty))
		if (index !== -1) {
			const cur = [...prev]
			cur[index] = ty
			return cur
		}

		const included = prev.some(p => ty.isSubtypeOf(p))
		return included ? prev : [...prev, ty]
	}, [] as Exclude<Value, TyUnion>[])

	if (normalizedTypes.length === 0) return bottom
	if (normalizedTypes.length === 1) return normalizedTypes[0]
	return TyUnion.fromTypesUnsafe(normalizedTypes)
}

export function intersectTy(...types: Value[]) {
	if (types.length === 0) return all
	if (types.length === 1) return types[0]

	const [first, ...rest] = types
	return rest.reduce(intersectTwo, first)

	function intersectTwo(a: Value, b: Value): Value {
		if (b.isSubtypeOf(a)) return b
		if (a.isSubtypeOf(b)) return a

		// TODO: Below code takes O(n^2) time
		const aTypes = a.type === 'tyUnion' ? a.types : [a]
		const bTypes = b.type === 'tyUnion' ? b.types : [b]

		const types = aTypes.flatMap(at => {
			return bTypes.flatMap(bt => {
				if (bt.isSubtypeOf(at)) return [bt]
				if (at.isSubtypeOf(bt)) return [at]
				return []
			})
		})

		if (types.length === 0) return bottom
		if (types.length === 1) return types[0]
		return TyUnion.fromTypesUnsafe(types)
	}
}

export class TyAtom implements IVal {
	public readonly type: 'tyAtom' = 'tyAtom'
	private constructor(
		public readonly name: string,
		public readonly convert: (val: Value) => Value
	) {}

	public print() {
		// TODO: fix this
		return this.name
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		return this === ty
	}

	public isEqualTo(val: Value): boolean {
		return val === this
	}

	public static of(name: string, convert: (val: Value) => Value) {
		return new TyAtom(name, convert)
	}
}

export const tyAtom = TyAtom.of

export class TySingleton implements IVal {
	public readonly type: 'tySingleton' = 'tySingleton'
	private constructor(public readonly value: TyFn | TyUnion | TyAtom) {}

	public print() {
		return '(singleton ' + this.value.print() + ')'
	}

	public isSubtypeOf(ty: Value): boolean {
		if (ty.type === 'all') return true
		if (ty.type === 'tyVar') return true
		if (ty.type === 'tyUnion') return ty.types.some(t => this.isSubtypeOf(t))
		if (ty.type === 'tySingleton') {
			return ty.value.isEqualTo(this.value)
		}
		return false
	}

	public convert() {
		return this
	}

	public isEqualTo(val: Value): boolean {
		return val.type === this.type && val.value.isEqualTo(this.value)
	}

	public static of(ty: TyFn | TyUnion | TyAtom) {
		return new TySingleton(ty)
	}
}

export const singleton = TySingleton.of

export const isEqual = (a: Value, b: Value) => a.isEqualTo(b)

export const tyInt = tyAtom('Int', () => int(0))
export const tyBool = TyUnion.fromTypesUnsafe([bool(false), bool(true)])
