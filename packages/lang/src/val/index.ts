import {intersectTy, uniteTy} from './type-operators'
import {
	All,
	Atom,
	Bottom,
	Enum,
	False,
	Fn,
	IFn,
	Int,
	Str,
	True,
	TyAtom,
	tyBool,
	TyEnum,
	TyFn,
	tyInt,
	tyIO,
	tyStr,
	TyUnion,
	TyValue,
	TyVar,
	Value,
	Vec,
} from './val'

export {Value}

export {All, Bottom, Fn, Int, Str, Vec}

export {TyAtom, TyFn, TyUnion, TyValue, TyVar}

export {tyInt, tyStr, tyBool, tyIO}

export {True, False}

export {intersectTy, uniteTy}

export {TyEnum, Enum}

// Shorthands
export const all = All.instance
export const bottom = Bottom.instance
export const int = Int.of
export const str = Str.of
export const atom = Atom.of
export const bool = (v: boolean): Enum => (v ? True : False)
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
	a.type === 'tyEnum'
