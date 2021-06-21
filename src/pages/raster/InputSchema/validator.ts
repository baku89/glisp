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
		case 'boolean':
			return _.isBoolean(data)
		case 'number':
			return _.isNumber(data)
		case 'color':
			return _.isString(data)
		case 'object': {
			if (!(data instanceof Object)) return false

			const dataProps = _.keys(data)
			const definedProps = _.keys(schema.properties)
			const requiredProps = schema.required || []
			const optionalProps = _.intersection(
				dataProps,
				_.difference(definedProps, requiredProps)
			)
			const additionalProps = _.difference(dataProps, definedProps)

			const required = requiredProps.every(name =>
				validate(data[name], schema.properties[name])
			)

			const optional = optionalProps.every(name =>
				validate(data[name], schema.properties[name])
			)

			if (schema.additionalProperties) {
				const sch = schema.additionalProperties
				const additional = additionalProps.every(name =>
					validate(data[name], sch)
				)
				return required && optional && additional
			} else {
				return required && optional
			}
		}
		case 'union':
			return Object.values(schema.items).some(sch => validate(data, sch))
	}
}

export function cast(data: Data | undefined, schema: Schema): Data {
	switch (schema.type) {
		case 'const':
			return schema.value
		case 'boolean':
			return _.isBoolean(data) ? data : schema.default || false
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
			const match = data === undefined ? undefined : matchUnion(data, schema)
			if (!match) {
				return cast(undefined, _.values(schema.items)[0])
			} else {
				return data as Data
			}
		}
	}
}
