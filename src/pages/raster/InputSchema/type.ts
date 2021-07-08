import {Validator} from '@/lib/fp'

export type Schema =
	| SchemaConst
	| SchemaBoolean
	| SchemaNumber
	| SchemaString
	| SchemaColor
	| SchemaCubicBezier
	| SchemaObject
	| SchemaUnion

export interface SchemaConst {
	type: 'const'
	value: DataPrimitive
	show?: boolean
}

export interface SchemaBoolean {
	type: 'boolean'
	default?: boolean
}

export interface SchemaNumber {
	type: 'number'
	ui?: 'number' | 'angle' | 'seed'
	min?: number
	max?: number
	precision?: number
	default?: number
	updateOnBlur?: boolean
	validator?: Validator<number>
}

export interface SchemaString {
	type: 'string'
	ui?: 'string' | 'dropdown'
	multiline?: boolean
	monospace?: boolean
	default?: string
	validator?: Validator<string>
}

export interface SchemaColor {
	type: 'color'
	default?: string
}

export interface SchemaCubicBezier {
	type: 'cubicBezier'
	default?: number[]
}

export interface SchemaObject {
	type: 'object'
	properties: {
		[prop: string]: Schema
	}
	required: string[]
	additionalProperties?: Schema
	additionalValidator?: Validator<string>
	additionalInfix?: string
}

export interface SchemaUnion {
	type: 'union'
	items: {
		[name: string]: Schema
	}
}

export type Data = DataPrimitive | DataObject
export const DATA_META = Symbol('data_meta')

export type DataPrimitive = boolean | number | string | number[]

export interface DataObject {
	[props: string]: Data
	DATA_META?: any
}
