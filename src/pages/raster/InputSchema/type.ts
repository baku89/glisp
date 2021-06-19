export type Schema = SchemaConst | SchemaNumber | SchemaColor | SchemaObject

interface SchemaConst {
	type: 'const'
	value: number | string
	show: boolean
}

interface SchemaNumber {
	type: 'number'
	default?: number
}

interface SchemaColor {
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

interface SchemaUnion {
	type: 'union'
	items: {
		[name: string]: Schema[]
	}
}

export type Data = DataPrimitive | DataObject
export const DATA_META = Symbol('data_meta')

type DataPrimitive = number | string

export interface DataObject {
	[props: string]: Data
	DATA_META?: any
}
