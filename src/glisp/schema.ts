import {getParamLabel} from '@/utils'

import {convertExprCollToJSObject} from './reader'
import {
	assocBang,
	createList,
	getEvaluated,
	getType,
	isExprFn,
	keywordFor as K,
	M_PARAMS,
	ExprFn,
	ExprSeq,
	ExprSymbol,
	Expr,
	symbolFor,
} from './types'
import {getStructType} from './utils'

interface SchemaBase {
	type: string
	ui: string
	label: string

	// Properties for uiSchema
	value?: Expr
	default?: Expr
	initial?: Expr
	isDefault?: boolean
	isInvalid?: boolean
}

/**
 * Schema for primitive value
 */

interface SchemaPrimitiveBase<T extends Expr> extends SchemaBase {
	value?: T
	default?: T
	variadic?: false
	key?: string
	validator: (input: T) => T | null
}

// Number
interface SchemaNumberDefault extends SchemaPrimitiveBase<number> {
	type: 'number'
	default?: number
}

interface SchemaNumberSlider extends SchemaNumberDefault {
	ui: 'slider'
	range: [number, number]
}

interface SchemaNumberSeed extends SchemaNumberDefault {
	ui: 'seed'
}

interface SchemaNumberAngle extends SchemaNumberDefault {
	ui: 'angle'
}

interface SchemaNumberDropdown extends SchemaNumberDefault {
	ui: 'dropdown'
	values: number[]
	labels?: string[]
}

type SchemaNumber =
	| SchemaNumberDefault
	| SchemaNumberSlider
	| SchemaNumberSeed
	| SchemaNumberAngle
	| SchemaNumberDropdown

// String
interface SchemaStringDefault extends SchemaPrimitiveBase<string> {
	type: 'string'
}

interface SchemaStringColor extends SchemaStringDefault {
	ui: 'color'
}

// interface SchemaStringDropdown extends SchemaStringDefault {
// 	ui: 'dropdown'
// 	values: string[]
// 	labels: string[]
// }

type SchemaString =
	| SchemaStringDefault
	| SchemaStringColor
	| SchemaStringDefault

// Keyword
interface SchemaKeywordDefault extends SchemaPrimitiveBase<string> {
	type: 'keyword'
}

interface SchemaKeywordDropdown extends SchemaKeywordDefault {
	ui: 'dropdown'
	values: string[]
	labels: string[]
}

// Symbol
interface SchemaSymbol extends SchemaPrimitiveBase<ExprSymbol> {
	type: 'symbol'
}

// Boolean
interface SchemaBoolean extends SchemaPrimitiveBase<boolean> {
	ui: 'boolean'
	description?: string
	trueLabel?: string
	falseLabel?: string
}

type SchemaKeyword = SchemaKeywordDefault | SchemaKeywordDropdown

// Vec2
interface SchemaVec2Default extends SchemaPrimitiveBase<ExprSeq> {
	type: 'vec2'
}

interface SchemaVec2Size extends SchemaVec2Default {
	ui: 'size2d'
}

type SchemaVec2 = SchemaVec2Default | SchemaVec2Size

// Rect2d
interface SchemaRect2d extends SchemaPrimitiveBase<ExprSeq> {
	type: 'rect2d'
}

// Mat2d
interface SchemaMat2d extends SchemaPrimitiveBase<ExprSeq> {
	type: 'mat2d'
}

// Path
interface SchemaPath extends SchemaPrimitiveBase<ExprSeq> {
	type: 'path'
}

// Any
interface SchemaAny extends SchemaPrimitiveBase<Expr> {
	type: 'any'
}

// Exp (always show with ExprSelectButton)
interface SchemaExp extends SchemaPrimitiveBase<Expr> {
	type: 'exp'
}

type SchemaPrimitive =
	| SchemaNumber
	| SchemaString
	| SchemaKeyword
	| SchemaSymbol
	| SchemaBoolean
	| SchemaVec2
	| SchemaRect2d
	| SchemaMat2d
	| SchemaPath
	| SchemaAny
	| SchemaExp

/**
 * Schema for vector / map
 */
export interface SchemaVector extends SchemaBase {
	type: 'vector'
	variadic?: boolean
	insert?: ExprFn
	items: SchemaPrimitive
}

export interface SchemaMap extends SchemaBase {
	type: 'map'
	variadic?: boolean
	items: SchemaPrimitive[]
}

export interface SchemaDynamic extends SchemaBase {
	type: 'dynamic'
	'to-schema': ExprFn
	'to-params': ExprFn
}

const DEFAULT_VALUE = {
	number: 0,
	boolean: true,
	string: '',
	keyword: K('_'),
	symbol: symbolFor('_'),
	color: '#000000',
	vec2: [0, 0],
	rect2d: [0, 0, 0, 0],
	mat2d: [1, 0, 0, 1, 0, 0],
}

/**
 * All Schema
 */

export type Schema = SchemaVector | SchemaMap | SchemaPrimitive

/**
 * Set the labels of schema by the parameters of Function references
 */
export function generateSchemaParamLabel(_schemaParams: Schema[], fn: ExprFn) {
	if (!isExprFn(fn)) {
		return _schemaParams
	}

	const schemaParams = [..._schemaParams]

	const labels = fn[M_PARAMS].map(p => getParamLabel(p)).filter(p => p !== '&')

	for (let i = 0; i < schemaParams.length; i++) {
		const schema = schemaParams[i]

		if (schema.variadic) {
			if (schema.type === 'vector' && !schema.items.label) {
				schemaParams[i] = {
					...schema,
					items: {...schema.items, label: labels[i]},
				}
			}
		} else {
			if (!schema.label) {
				schemaParams[i] = {...schema, label: labels[i]}
			}
		}
	}

	return schemaParams
}

/**
 *
 * ex: [10 20] -> [[10 20]]
 * ex
 */
export function extractParams(exp: ExprSeq): ExprSeq {
	const structType = getStructType(exp)
	if (structType) {
		const structSymbol = symbolFor(structType)
		return createList(structSymbol, exp)
	} else {
		return exp
	}
}

function generateFixedUISchema(schemaParams: Schema[], params: Expr[]) {
	// Deep clone the schema
	const uiSchema = schemaParams.map(sch => ({...sch}))

	// Flatten the schema if it is variadic
	const lastSchema = uiSchema.at(-1)

	if (lastSchema?.variadic) {
		// Check if parameters is too short
		if (params.length < uiSchema.length - 1) {
			params = [...params]
			for (let i = params.length; i < uiSchema.length - 1; i++) {
				uiSchema[i].isInvalid = true
				params.push((DEFAULT_VALUE as any)[uiSchema[i].ui || uiSchema[i].type])
			}
			// console.log('too short', uiSchema)
		}

		// Delete the last variadic schema itself
		uiSchema.pop()

		if (lastSchema.type === 'vector') {
			const variadicSchema = lastSchema.items

			while (uiSchema.length < params.length) {
				uiSchema.push({...variadicSchema})
			}
		} else if (lastSchema.type === 'map') {
			const restParams = params.slice(uiSchema.length)
			const restMap = assocBang({}, ...restParams)
			params = params.slice(0, uiSchema.length)

			for (const sch of lastSchema.items) {
				if (!sch.label) {
					sch.label = getParamLabel(sch.key as string)
				}

				const newSch = {...sch}
				delete newSch.key
				uiSchema.push(newSch)

				params.push(restMap[sch.key as string] || (sch.default as any))
			}
		} else {
			throw new Error('Invalid type for the variadic argument')
		}
	} else {
		// Fill the params with the default values if possible
		for (let i = params.length; i < uiSchema.length; i++) {
			const sch = uiSchema[i]
			if ('initial' in sch) {
				params.push(sch.initial as Expr)
			} else if ('default' in sch) {
				params.push(sch.default as Expr)
			} else {
				break
			}
		}
	}

	// Extract the parameters from the list
	const evaluatedParams = params.map(p => getEvaluated(p))

	// Assign the value
	for (let i = 0; i < uiSchema.length; i++) {
		const sch = uiSchema[i]

		// Force set the UI type
		sch.ui = sch.ui || sch.type

		// Get value
		sch.isInvalid = sch.isInvalid || i >= params.length
		let value: Expr = !sch.isInvalid
			? params[i]
			: 'initial' in sch
			  ? sch.initial
			  : 'default' in sch
			    ? sch.default
			    : (DEFAULT_VALUE as any)[sch.ui]

		const evaluated: Expr = !sch.isInvalid ? evaluatedParams[i] : value
		const valueType = getStructType(evaluated) || getType(evaluated)

		switch (sch.type) {
			case 'any':
				sch.type = valueType as any
				break
			case 'exp':
			case 'boolean':
				break
			default:
				// Check if the type mathces
				if (valueType !== sch.type) {
					sch.isInvalid = true
					value =
						'initial' in sch
							? sch.initial
							: 'default' in sch
							  ? sch.default
							  : (DEFAULT_VALUE as any)[sch.ui]
				}
		}

		// Set value with wrapped by nonReactive
		sch.value = value
		if ('default' in sch) {
			sch.isDefault = value === sch.default
		}
	}

	return uiSchema
}

function generateDynamicUISchema(schemaParams: SchemaDynamic, params: Expr[]) {
	const toSchema = schemaParams['to-schema']

	const uiSchema = convertExprCollToJSObject(
		toSchema({[K('params')]: params})
	) as Schema[]

	for (const sch of uiSchema) {
		const value = sch.value as Expr
		sch.value = value

		// Force set the UI type
		sch.ui = sch.ui || sch.type

		if ('default' in sch) {
			sch.isDefault = value === sch.default
		}
	}
	return uiSchema
}

/**
 * Generates UISchema for the parameter of function application
 */
export function generateUISchema(
	schemaParams: Schema[] | SchemaDynamic,
	params: Expr[]
) {
	if (!Array.isArray(schemaParams)) {
		return generateDynamicUISchema(schemaParams, params)
	} else {
		return generateFixedUISchema(schemaParams, params)
	}
}

function updateParamsByFixedUISchema(
	schemaParams: Schema[],
	uiSchema: Schema[],
	params: Expr[],
	index: number,
	value: Expr
) {
	const lastSchema = schemaParams[schemaParams.length - 1]

	if (lastSchema.variadic && lastSchema.type === 'map') {
		const restPos = schemaParams.length - 1
		const restMap = assocBang({}, ...params.slice(restPos))
		const newParams = [...params.slice(0, restPos)]
		const items = lastSchema.items

		// Fill the lacking params
		for (let i = newParams.length; i < index; i++) {
			newParams.push(
				'default' in uiSchema[i]
					? (uiSchema[i].default as Expr)
					: (uiSchema[i].value as Expr)
			)
		}

		if (index < restPos) {
			// Update the list part
			newParams[index] = value
		} else {
			// Update the map part
			const schema = items[index - restPos]
			const key = schema.key as string
			// NOTE: Might occur error
			if (value === schema.default) {
				delete restMap[key]
			} else {
				restMap[key] = value
			}
		}

		newParams.push(...Object.entries(restMap).flat())
		return newParams
	} else {
		const newParams = uiSchema.map(sch => sch.value) as Expr[]
		newParams[index] = value

		// Shorten the parameters as much as possible
		for (let i = schemaParams.length - 1; i >= 0; i--) {
			if (!('default' in schemaParams[i])) {
				break
			}
			if (schemaParams[i].default === newParams[i]) {
				newParams.pop()
			}
		}

		return newParams
	}
}

function updateParamsByDynamicUISchema(
	schuema: SchemaDynamic,
	uiSchema: Schema[],
	index: number,
	value: Expr
) {
	const params = uiSchema.map(s => s.value as Expr)
	params[index] = value
	const toParams = schuema['to-params']
	return toParams({[K('values')]: params}) as Expr[]
}

/**
 * Computes the original parameters from UIParamSchema and updated value
 */
export function updateParamsByUISchema(
	schema: Schema[] | SchemaDynamic,
	uiSchema: Schema[],
	params: Expr[],
	index: number,
	value: Expr
) {
	if (!Array.isArray(schema)) {
		return updateParamsByDynamicUISchema(schema, uiSchema, index, value)
	} else {
		return updateParamsByFixedUISchema(schema, uiSchema, params, index, value)
	}
}
