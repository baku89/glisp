import {
	AllKeyword,
	Arg,
	Call,
	DictLiteral,
	FnDef,
	FnTypeDef,
	Identifier,
	InnerNode,
	isSame,
	LeafNode,
	NeverKeyword,
	Node,
	NumLiteral,
	print,
	Scope,
	setParent,
	StrLiteral,
	TryCatch,
	UnitLiteral,
	ValueContainer,
	VecLiteral,
} from './ast'

export {Node, LeafNode, InnerNode, Arg}

// Exp
export {
	Identifier,
	ValueContainer,
	UnitLiteral,
	AllKeyword,
	NeverKeyword,
	NumLiteral,
	StrLiteral,
	Call,
	Scope,
	TryCatch,
	FnDef,
	FnTypeDef,
	VecLiteral,
	DictLiteral,
}

export const id = Identifier.of
export const value = ValueContainer.of
export const unit = UnitLiteral.of
export const all = AllKeyword.of
export const never = NeverKeyword.of
export const num = NumLiteral.of
export const str = StrLiteral.of
export const call = Call.of
export const scope = Scope.of
export const tryCatch = TryCatch.of
export const fn = FnDef.of
export const fnType = FnTypeDef.of
export const fnTypeFrom = FnTypeDef.from
export const vec = VecLiteral.of
export const vecFrom = VecLiteral.from
export const dict = DictLiteral.of
export const dictFrom = DictLiteral.from

export {isSame, print, setParent}
