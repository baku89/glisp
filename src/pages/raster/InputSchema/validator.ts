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

export function cast(data: Data | null, schema: Schema): Data {
	switch (schema.type) {
		case 'const':
			return schema.value
		case 'number':
			return _.isNumber(data) ? data : schema.default || 0
		case 'color':
			return _.isString(data) ? data : schema.default || '#ffffff'
		case 'object': {
			const obj = _.isObject(data) ? {...data} : {}
			for (const [name, s] of _.entries(schema.properties)) {
				obj[name] = cast(obj[name], s)
			}
			if (schema.additionalProperties) {
				for (const name in obj) {
					if (name in schema.properties) continue
					obj[name] = cast(obj[name], schema.additionalProperties)
				}
			}
			return obj
		}
		case 'union': {
			const match = data === null ? null : matchUnion(data, schema)
			if (!match) {
				return cast(null, _.values(schema.items)[0])
			} else {
				return data as Data
			}
		}
	}
}
