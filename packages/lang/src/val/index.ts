import {tyDifference, tyIntersection, tyUnion} from './TypeOperation'
import {
	All,
	Dict,
	Enum,
	Fn,
	IFn,
	isEqual,
	isSubtype,
	Never,
	Num,
	Prim,
	Str,
	Struct,
	TyEnum,
	TyFn,
	tyNum,
	TyPrim,
	tyStr,
	TyStruct,
	TyUnion,
	TyVar,
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
	TyPrim,
	TyVar,
	Enum,
	TyEnum,
	Fn,
	TyFn,
	Vec,
	Dict,
	Struct,
	TyStruct,
	TyUnion,
}

const tyBool = TyEnum.of('Bool', ['false', 'true'])
const True = tyBool.getEnum('true')
const False = tyBool.getEnum('false')

export {tyNum, tyStr, tyBool, True, False}

export const all = All.instance
export const never = Never.instance
export const unit = Unit.instance
export const num = Num.of
export const str = Str.of
export const bool = (value: boolean) => (value ? True : False)
export const tyPrim = TyPrim.of
export const tyEnum = TyEnum.of
export const fn = Fn.of
export const fnFrom = Fn.from
export const tyFn = TyFn.of
export const tyFnFrom = TyFn.from
export const tyVar = TyVar.of
export const vec = Vec.of
export const vecFrom = Vec.from
export const dict = Dict.of
export const tyStruct = TyStruct.of

// Type operations
export {tyUnion, tyDifference, tyIntersection}

export {isEqual, isSubtype}
