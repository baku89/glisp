import {
	All,
	App,
	Bottom,
	Dict,
	EVec,
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
	TyVar,
	Unit,
	ValueWithLog,
} from './exp'

export {Node}

export {Sym, Obj, Fn, TyFn, EVec as Vec, App, Scope}

export {Log, ValueWithLog, NodeWithLog}

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
export const vec = EVec.of
export const dict = Dict.of
export const dictFrom = Dict.from
export const vecFrom = EVec.from
export const app = App.of
export const scope = Scope.of

export {isSame}
