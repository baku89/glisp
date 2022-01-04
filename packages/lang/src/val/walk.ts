import {values} from 'lodash'

import type * as Val from './val'

type ValueType = Val.Value['type']

type VisitorFn<T extends ValueType, U> = (
	value: TypeToValue<T>,
	fold: (...us: U[]) => U,
	c: (child: Val.Value) => U
) => U

type TypeToValue<T extends ValueType> = T extends 'All'
	? Val.All
	: T extends 'PrimType'
	? Val.PrimType
	: T extends 'EnumType'
	? Val.EnumType
	: T extends 'FnType'
	? Val.FnType
	: T extends 'StructType'
	? Val.StructType
	: T extends 'UnionType'
	? Val.UnionType
	: T extends 'TypeVar'
	? Val.TypeVar
	: T extends 'Never'
	? Val.Never
	: T extends 'Unit'
	? Val.Unit
	: T extends 'Prim'
	? Val.Prim
	: T extends 'Enum'
	? Val.Enum
	: T extends 'Fn'
	? Val.Fn
	: T extends 'Vec'
	? Val.Vec
	: T extends 'Dict'
	? Val.Dict
	: T extends 'Struct'
	? Val.Struct
	: Val.Value

type Visitors<U> = {
	[T in ValueType]?: VisitorFn<T, U>
}

export function createFoldFn<U>(
	visitors: Visitors<U>,
	initial: U,
	foldFn: (...xs: U[]) => U
) {
	return (value: Val.Value) => fold(value)

	function fold(value: Val.Value): U {
		const {type} = value

		if (type in visitors) {
			return (visitors[type] as any)(value, foldFn, fold)
		}

		switch (type) {
			case 'UnionType':
				return foldFn(...value.types.map(fold))
			case 'Fn':
				return fold(value.fnType)
			case 'FnType':
				return foldFn(...values(value.param).map(fold), fold(value.out))
			case 'Vec':
				return foldFn(
					...value.items.map(fold),
					value.rest ? fold(value.rest) : initial
				)
			case 'Dict':
				return foldFn(
					...values(value.items).map(fold),
					value.rest ? fold(value.rest) : initial
				)
			default:
				return initial
		}
	}
}
