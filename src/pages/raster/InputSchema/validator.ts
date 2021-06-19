import _ from 'lodash'

import {Data, Schema, SchemaUnion} from './type'

export function matchUnion(
	data: Data,
	schema: SchemaUnion
): [string, Exclude<Schema, SchemaUnion>] | null {
	let result: [string, Schema] | undefined = ['', schema]

	while (result[1].type === 'union') {
		result = Object.entries(schema.items).find(([, sch]) => validate(data, sch))

		if (!result) return null
	}
	console.log(result)
	return result as [string, Exclude<Schema, SchemaUnion>]
}

export function validate(data: Data, schema: Schema): boolean {
	switch (schema.type) {
		case 'const':
			return data === schema.value
		case 'number':
			return typeof data === 'number'
		case 'color':
			return typeof data === 'string'
		case 'object': {
			if (!(data instanceof Object)) return false
			const required = _.entries(schema.properties).every(([prop, sch]) =>
				validate(data[prop], sch)
			)
			if (schema.additionalProperties) {
				const sch = schema.additionalProperties
				const additionals = _.difference(
					_.keys(data),
					_.keys(schema.properties)
				).every(name => validate(data[name], sch))
				return required && additionals
			} else {
				return required
			}
		}
		case 'union':
			return Object.values(schema.items).some(sch => validate(data, sch))
	}
}

;(window as any).isNumber = _.isNumber

export function getDefault(schema: Schema): Data {
	switch (schema.type) {
		case 'const':
			return schema.value
		case 'number':
			return schema.default || 0
		case 'color':
			return schema.default || '#ffffff'
		case 'object':
			return _.mapValues(schema.properties, s => getDefault(s))
		case 'union': {
			return getDefault(_.values(schema.items)[0])
		}
	}
}
