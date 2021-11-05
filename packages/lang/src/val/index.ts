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
	TySingleton,
	TyUnion,
	TyVar,
	Value,
} from './val'

export {Value}

export {All, Bool, Bottom, Fn, Int}

export {TyAtom, TyFn, TyUnion, TySingleton, TyVar}

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
export const singleton = TySingleton.of

export const isEqual = (a: Value, b: Value) => a.isEqualTo(b)
export const isSubtype = (a: Value, b: Value) => a.isSubtypeOf(b)
