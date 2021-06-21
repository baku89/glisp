export type Schema =
	| SchemaConst
	| SchemaBoolean
	| SchemaNumber
	| SchemaString
	| SchemaColor
	| SchemaObject
	| SchemaUnion

export interface SchemaConst {
	type: 'const'
	value: DataPrimitive
	show: boolean
}

export interface SchemaBoolean {
	type: 'boolean'
	default?: boolean
}

export interface SchemaNumber {
	type: 'number'
	ui: 'number' | 'slider' | 'angle'
	min?: number
	max?: number
	default?: number
}

export interface SchemaString {
	type: 'string'
	default?: string
}

export interface SchemaColor {
	type: 'color'
	default?: string
}

export interface SchemaObject {
	type: 'object'
	properties: {
		[prop: string]: Schema
	}
	required: string[]
	additionalProperties?: Schema
}

export interface SchemaUnion {
	type: 'union'
	items: {
		[name: string]: Schema
	}
}

export type Data = DataPrimitive | DataObject
export const DATA_META = Symbol('data_meta')

export type DataPrimitive = boolean | number | string

export interface DataObject {
	[props: string]: Data
	DATA_META?: any
}
