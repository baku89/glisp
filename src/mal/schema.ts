import {getParamLabel, NonReactive, nonReactive} from '@/utils'
import AppScope from '@/scopes/app'
import {
	MalVal,
	MalSeq,
	MalSymbol,
	getType,
	getEvaluated,
	createList,
	symbolFor,
	MalFunc,
	M_PARAMS,
	isMalFunc,
} from './types'
import {getStructType} from './utils'
import printExp from './printer'

/**
 * Schema for primitive value
 */

interface SchemaPrimitiveBase<T> {
	type: string
	ui: string
	label: string
	value?: NonReactive<T>
	default?: T
	variadic?: true
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

interface SchemaStringDropdown extends SchemaStringDefault {
	ui: 'dropdown'
	values: string[]
	labels: string[]
}

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
interface SchemaSymbol extends SchemaPrimitiveBase<MalSymbol> {
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
interface SchemaVec2Default extends SchemaPrimitiveBase<MalSeq> {
	type: 'vec2'
}

interface SchemaVec2Size extends SchemaVec2Default {
	ui: 'size'
}

type SchemaVec2 = SchemaVec2Default | SchemaVec2Size

// Rect2d
interface SchemaRect2d extends SchemaPrimitiveBase<MalSeq> {
	type: 'rect2d'
}

// Mat2d
interface SchemaMat2d extends SchemaPrimitiveBase<MalSeq> {
	type: 'mat2d'
}

// Path
interface SchemaPath extends SchemaPrimitiveBase<MalSeq> {
	type: 'path'
}

// Any
interface SchemaAny extends SchemaPrimitiveBase<MalVal> {
	type: 'any'
}

// Exp (always show with MalExpButton)
interface SchemaExp extends SchemaPrimitiveBase<MalVal> {
	type: 'exp'
}

type SchemaPrimitive =
	| SchemaNumber
	| SchemaString
	| SchemaKeyword
	| SchemaSymbol
	| SchemaVec2
	| SchemaRect2d
	| SchemaMat2d
	| SchemaPath
	| SchemaAny
	| SchemaExp

/**
 * Schema for Parameters
 */
export type SchemaParams = SchemaPrimitive[]

/**
 * Set the labels of schema by the parameters of Function references
 */
export function generateSchemaParamLabel(
	_schemaParams: SchemaParams,
	fn: MalFunc
) {
	if (!isMalFunc(fn)) {
		return _schemaParams
	}

	const schemaParams = [..._schemaParams]

	const labels = fn[M_PARAMS].map(p => getParamLabel(printExp(p)))

	for (let i = 0; i < schemaParams.length; i++) {
		if (!schemaParams[i].label) {
			schemaParams[i] = {...schemaParams[i], label: labels[i]}
		}
	}

	return schemaParams
}

/**
 *
 * ex: [10 20] -> [[10 20]]
 * ex
 */
export function extractParams(exp: MalSeq): MalSeq {
	const structType = getStructType(exp)
	if (structType) {
		const structSymbol = symbolFor(structType)
		structSymbol.evaluated = AppScope.var(structType) as MalFunc
		return createList(structType, exp)
	} else {
		return exp
	}
}

/**
 * Generates UISchema for the parameter of function application
 */
export function generateUISchemaParams(
	schemaParams: SchemaParams,
	params: MalVal[]
) {
	// Check if zero
	if (schemaParams.length === 0) {
		if (params.length !== 0) {
			throw new Error('The number of parameters should be zero')
		}
		return []
	}

	// Deep clone the schema
	const uiSchema = /* deepClone( */ schemaParams /* ) */

	// Normalize the schema to fixed if it's valiadic
	const isVariadic = !!uiSchema[uiSchema.length - 1].variadic
	if (isVariadic) {
		// Check if parameters is too short
		if (params.length < uiSchema.length - 1) {
			throw new Error('The parameters is too short')
		}
		// Duplicate the lastSchema
		const lastSchema = uiSchema[uiSchema.length - 1]
		delete lastSchema.variadic

		while (uiSchema.length < params.length) {
			uiSchema.push({...lastSchema})
		}
	}

	// Check if the exp is the same length as the params
	if (params.length !== uiSchema.length) {
		throw new Error("The length of exp does not match with schema's")
	}

	// Extract the parameters from the list
	const evaluatedParams = params.map(p => getEvaluated(p))

	// Assign the value
	for (let i = 0; i < params.length; i++) {
		const value = params[i]
		const evaluated = evaluatedParams[i]
		const schema = uiSchema[i]
		const valueType = getStructType(evaluated) || getType(evaluated)

		switch (schema.type) {
			case 'any':
				schema.type = valueType as any
				break
			case 'exp':
				break
			default:
				// Check if the type mathces
				if (valueType !== schema.type) {
					console.log(valueType, schema.type)
					throw new Error('Exp does not match to the schema')
				}
		}

		// Force set the UI type
		schema.ui = schema.ui || schema.type

		// NOTE: needs an appropreate typing
		schema.value = nonReactive(value as any)
	}

	return uiSchema
}
