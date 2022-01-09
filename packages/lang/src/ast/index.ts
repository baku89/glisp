import {
	AllKeyword,
	Call,
	DictLiteral,
	FnDef,
	FnTypeDef,
	Identifier,
	NeverKeyword,
	NumLiteral,
	Scope,
	StrLiteral,
	TryCatch,
	TypeVarsDef,
	ValueContainer,
	VecLiteral,
} from './ast'

export {Node, LeafNode, InnerNode, Arg} from './ast'

export {ValueMeta, NodeMeta} from './ast'

export {isSame, print, setParent, clone} from './ast'

// Exp
export {
	Identifier,
	ValueContainer,
	AllKeyword,
	NeverKeyword,
	NumLiteral,
	StrLiteral,
	Call,
	Scope,
	TryCatch,
	FnDef,
	FnTypeDef,
	TypeVarsDef,
	VecLiteral,
	DictLiteral,
}

export const id = Identifier.of
export const value = ValueContainer.of
export const all = AllKeyword.of
export const never = NeverKeyword.of
export const num = NumLiteral.of
export const str = StrLiteral.of
export const call = Call.of
export const scope = Scope.of
export const tryCatch = TryCatch.of
export const fn = FnDef.of
export const fnType = FnTypeDef.of
export const vec = VecLiteral.of
export const dict = DictLiteral.of
