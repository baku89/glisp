import {
	All,
	App,
	Bottom,
	Dict,
	EDict,
	EFn,
	Enum,
	ETyFn,
	EVec,
	Exp,
	ExpComplex,
	Fn,
	IFn,
	isEqual,
	isSame,
	isSubtype,
	Node,
	Num,
	Prim,
	print,
	Prod,
	Scope,
	setParent,
	Str,
	Sym,
	TyDict,
	TyEnum,
	TyFn,
	tyNum,
	TyPrim,
	TyProd,
	tyStr,
	TyUnion,
	TyVar,
	TyVec,
	Unit,
	Value,
	Vec,
} from './exp'
import {Log, WithLog, withLog} from './log'
import {tyDifference, tyIntersection, tyUnion} from './TypeOperation'

export {IFn}

export {Node, Exp, ExpComplex, Value}

export {Log, WithLog, withLog}

// Exp
export {Sym, App, Scope, EFn, ETyFn, EVec, EDict}

export const sym = Sym.of
export const app = App.of
export const scope = Scope.of
export const eFn = EFn.of
export const eTyFn = ETyFn.of
export const eTyFnFrom = ETyFn.from
export const eVec = EVec.of
export const eVecFrom = EVec.from
export const eDict = EDict.of
export const eDictFrom = EDict.from

// Value
export {
	All,
	Bottom,
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
	TyVec,
	Dict,
	TyDict,
	Prod,
	TyProd,
	TyUnion,
}

const tyBool = TyEnum.of('Bool', ['false', 'true'])
const True = tyBool.getEnum('true')
const False = tyBool.getEnum('false')

export {tyNum, tyStr, tyBool, True, False}

export const all = All.instance
export const bottom = Bottom.instance
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
export const tyVec = TyVec.of
export const dict = Dict.of
export const tyDict = TyDict.of

// Type operations
export {tyUnion, tyDifference, tyIntersection}

export {isSame, isEqual, isSubtype, print, setParent}
