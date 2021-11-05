import {intersectTy, uniteTy} from './type-operators'
import {
	All,
	Bool,
	Bottom,
	Fn,
	Int,
	TyAtom,
	tyBool,
	TyFn,
	tyInt,
	TyUnion,
	TyValue,
	TyVar,
	Value,
} from './val'

export {Value}

export {All, Bool, Bottom, Fn, Int}

export {TyAtom, TyFn, TyUnion, TyValue, TyVar}

export {tyInt, tyBool}

export {intersectTy, uniteTy}

// Shorthands
export const all = All.instance
export const bottom = Bottom.instance
export const int = Int.of
export const bool = Bool.of
export const fn = Fn.of
export const tyVar = TyVar.fresh
export const tyFn = TyFn.of
export const tyAtom = TyAtom.of
export const tyValue = TyValue.of

export const isEqual = (a: Value, b: Value) => a.isEqualTo(b)
export const isSubtype = (a: Value, b: Value) => a.isSubtypeOf(b)

export const isTyFn = (a: Value): a is Fn | TyFn =>
	a.type === 'fn' || a.type === 'tyFn'

export const isTy = (a: Value): a is TyFn | TyUnion | TyAtom | TyVar =>
	a.type === 'tyFn' ||
	a.type === 'tyUnion' ||
	a.type === 'tyAtom' ||
	a.type === 'tyVar'
