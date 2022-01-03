import {
	Arg,
	Call,
	EDict,
	EFn,
	ETyFn,
	EVec,
	Exp,
	isSame,
	LAll,
	LBottom,
	Literal,
	LNum,
	LStr,
	LUnit,
	Node,
	Obj,
	print,
	Scope,
	setParent,
	Sym,
	TryCatch,
} from './ast'

export {Node, Literal, Exp, Arg}

// Exp
export {
	Sym,
	Obj,
	LUnit,
	LAll,
	LBottom,
	LNum,
	LStr,
	Call,
	Scope,
	TryCatch,
	EFn,
	ETyFn,
	EVec,
	EDict,
}

export const sym = Sym.of
export const obj = Obj.of
export const lUnit = LUnit.of
export const lAll = LAll.of
export const lBottom = LBottom.of
export const lNum = LNum.of
export const lStr = LStr.of
export const call = Call.of
export const scope = Scope.of
export const tryCatch = TryCatch.of
export const eFn = EFn.of
export const eTyFn = ETyFn.of
export const eTyFnFrom = ETyFn.from
export const eVec = EVec.of
export const eVecFrom = EVec.from
export const eDict = EDict.of
export const eDictFrom = EDict.from

export {isSame, print, setParent}
