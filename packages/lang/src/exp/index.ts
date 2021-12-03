import {
	All,
	App,
	Bottom,
	Dict,
	Fn,
	isSame,
	Log,
	Node,
	NodeWithLog,
	Num,
	Obj,
	Scope,
	Str,
	Sym,
	TyFn,
	Type,
	TyVar,
	Unit,
	ValueWithLog,
	Vec,
} from './exp'

export {Node}

export {Sym, Obj, Fn, TyFn, Vec, App, Scope}

export {Type, Log, ValueWithLog, NodeWithLog}

// Shorthands
export const sym = Sym.of
export const obj = Obj.of
export const all = All.of
export const bottom = Bottom.of
export const unit = Unit.of
export const num = Num.of
export const str = Str.of
export const tyVar = TyVar.of
export const fn = Fn.of
export const tyFn = TyFn.of
export const vec = Vec.of
export const dict = Dict.of
export const dictFrom = Dict.from
export const vecFrom = Vec.from
export const app = App.of
export const scope = Scope.of

export {isSame}
