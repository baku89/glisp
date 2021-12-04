import {
	All,
	App,
	Bottom,
	EDict,
	EFn,
	ETyFn,
	EVec,
	isSame,
	Log,
	Node,
	NodeWithLog,
	Num,
	Obj,
	Scope,
	Str,
	Sym,
	TyVar,
	Unit,
	ValueWithLog,
} from './exp'

export {Node}

export {Sym, Obj, EFn as Fn, ETyFn as TyFn, EVec as Vec, App, Scope}

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
export const fn = EFn.of
export const tyFn = ETyFn.of
export const vec = EVec.of
export const dict = EDict.of
export const dictFrom = EDict.from
export const vecFrom = EVec.from
export const app = App.of
export const scope = Scope.of

export {isSame}
