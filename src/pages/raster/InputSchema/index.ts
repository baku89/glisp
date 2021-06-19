type Schema = SchemaObject | SchemaNumber | SchemaColor

interface SchemaObject {
	type: 'object'
	properties: {
		[prop: string]: Schema
	}
	required: string[]
}

interface SchemaNumber {
	type: 'number'
	default?: number
}

interface SchemaColor {
	type: 'color'
	default?: string
}

interface SchemaDiscriminatingUnion {
	type: 'discriminatingUnion'
	items: SchemaObject[]
	key: string
}
