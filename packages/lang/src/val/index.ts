import {
	All,
	Dict,
	Enum,
	EnumType,
	Fn,
	FnType,
	IFn,
	Never,
	Num,
	NumType,
	Prim,
	PrimType,
	Str,
	StrType,
	Struct,
	StructType,
	TypeVar,
	UnionType,
	Unit,
	Value,
	Vec,
} from './val'

export {IFn, Value}

// Value
export {
	All,
	Never,
	Unit,
	Num,
	Str,
	Prim,
	PrimType,
	TypeVar,
	Enum,
	EnumType,
	Fn,
	FnType,
	Vec,
	Dict,
	Struct,
	StructType,
	UnionType,
}

const BoolType = EnumType.of('Bool', ['false', 'true'])
const True = BoolType.getEnum('true')
const False = BoolType.getEnum('false')

export {NumType, StrType, BoolType, True, False}

export const all = All.instance
export const never = Never.instance
export const unit = Unit.instance
export const num = Num.of
export const str = Str.of
export const bool = (value: boolean) => (value ? True : False)
export const primType = PrimType.of
export const enumType = EnumType.of
export const fn = Fn.of
export const fnFrom = Fn.from
export const fnType = FnType.of
export const typeVar = TypeVar.of
export const vec = Vec.of
export const vecFrom = Vec.from
export const dict = Dict.of
export const structType = StructType.of

export {isEqual, isSubtype} from './val'

export {unionType, differenceType, intersectionType} from './TypeOperation'
