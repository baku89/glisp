import {intersectTy, uniteTy} from './type-operators'
import {
	Alg,
	AlgCtor,
	All,
	Bottom,
	False,
	Fn,
	IFn,
	Int,
	True,
	TyAtom,
	tyBool,
	TyFn,
	tyInt,
	TyUnion,
	TyValue,
	TyVar,
	TyVariant,
	Value,
	Vec,
} from './val'

export {Value}

export {All, Bottom, Fn, Int, Vec}

export {TyAtom, TyFn, TyUnion, TyValue, TyVar}

export {tyInt, tyBool}

export {intersectTy, uniteTy}

export {TyVariant, Alg, AlgCtor}

// Shorthands
export const all = All.instance
export const bottom = Bottom.instance
export const int = Int.of
export const bool = (v: boolean): AlgCtor => (v ? True : False)
export const fn = Fn.of
export const vec = Vec.of
export const vecFrom = Vec.from
export const tyVar = TyVar.of
export const freshTyVar = TyVar.fresh
export const tyFn = TyFn.of
export const tyAtom = TyAtom.of
export const tyValue = TyValue.of

export {IFn}

export const isEqual = (a: Value, b: Value) => a.isEqualTo(b)
export const isSubtype = (a: Value, b: Value) => a.isSubtypeOf(b)

export const isTy = (a: Value): a is Vec | TyFn | TyUnion | TyAtom | TyVar =>
	a.type === 'vec' ||
	a.type === 'tyFn' ||
	a.type === 'tyUnion' ||
	a.type === 'tyAtom' ||
	a.type === 'tyVar' ||
	a.type === 'tyVariant'
