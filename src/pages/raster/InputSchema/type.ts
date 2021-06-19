export type Schema =
	| SchemaConst
	| SchemaNumber
	| SchemaColor
	| SchemaObject
	| SchemaUnion

export interface SchemaConst {
	type: 'const'
	value: DataPrimitive
	show: boolean
}

export interface SchemaNumber {
	type: 'number'
	ui: 'number' | 'slider' | 'angle'
	min?: number
	max?: number
	default?: number
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

export type DataPrimitive = number | string

export interface DataObject {
	[props: string]: Data
	DATA_META?: any
}
