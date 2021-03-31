import {capital} from 'case'
import deepClone from 'deep-clone'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^[a-z_+\-*/=?<>][0-9a-z_+\-*/=?<>]*$/i

type ExpForm =
	| ExpNull
	| ExpBoolean
	| ExpNumber
	| ExpString
	| ExpKeyword
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpFn
	| ExpTag
	| ExpRaw

interface ExpBase {
	parent?: ExpList | ExpVector | ExpHashMap | ExpFn
	tag?: {
		value: ExpTag | ExpSymbol
		delimiters?: string[]
	}
	tagResolved?: ExpTag
	dup?: Set<ExpSymbol | ExpList>
}

interface ExpProgram {
	literal: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpNull extends ExpBase {
	literal: 'null'
}

interface ExpBoolean extends ExpBase {
	literal: 'boolean'
	value: boolean
}

interface ExpNumber extends ExpBase {
	literal: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	literal: 'string'
	value: string
}

interface ExpKeyword extends ExpBase {
	literal: 'keyword'
	value: string
}

interface ExpSymbol extends ExpBase {
	literal: 'symbol'
	value: string
	str?: string
	ref?: ExpForm
	evaluated?: ExpForm
}

interface ExpList extends ExpBase {
	literal: 'list'
	value: ExpForm[]
	delimiters?: string[]
	expanded?: ExpForm
	evaluated?: ExpForm
}

interface ExpVector extends ExpBase {
	literal: 'vector'
	value: ExpForm[]
	delimiters?: string[]
	evaluated?: ExpVector
}

interface ExpHashMap extends ExpBase {
	literal: 'hashMap'
	value: {
		[key: string]: ExpForm
	}
	keyQuoted?: {
		[key: string]: boolean
	}
	delimiters?: (string | [string, string])[]
	evaluated?: ExpHashMap
}

interface ExpTag extends ExpBase {
	literal: 'tag'
	create?: (...params: any[]) => ExpForm
	meta?: ExpHashMap
	body:
		| {
				type: 'any'
				default: () => ExpForm
		  }
		| {
				type: ExpNull['literal']
				default: () => ExpNull
		  }
		| {
				type: ExpBoolean['literal']
				default: () => ExpBoolean
		  }
		| {
				type: ExpNumber['literal']
				default: () => ExpNumber
		  }
		| {
				type: ExpString['literal']
				default: () => ExpString
		  }
		| {
				type: ExpKeyword['literal']
				default: () => ExpKeyword
		  }
		| {
				type: ExpHashMap['literal']
				default: () => ExpHashMap
		  }
		| {
				type: ExpTag['literal']
				default: () => ExpTag
		  }
		| {
				type: ExpFn['literal']
				params: ExpTag[]
				return: ExpTag
		  }
}

interface ExpFn extends ExpBase {
	literal: 'fn'
	value: (...params: ExpForm[]) => ExpForm
}

interface ExpRaw extends ExpBase {
	literal: 'raw'
	value: any
}

export function readStr(str: string): ExpForm {
	const exp = parser.parse(str) as ExpProgram
	return exp.value
}

const ExpTagAny: ExpTag = {
	literal: 'tag',
	create: (v: ExpForm = createNull()) => v,
	body: {
		type: 'any',
		default: () => createNull(),
	},
}

const ExpTagNull: ExpTag = {
	literal: 'tag',
	create: () => createNull(),
	body: {
		type: 'null',
		default: () => createNull(),
	},
}

const ExpTagBoolean: ExpTag = {
	literal: 'tag',
	create: (v: ExpBoolean = createBoolean(false)) => v,
	body: {
		type: 'boolean',
		default: () => createBoolean(false),
	},
}

const ExpTagNumber: ExpTag = {
	literal: 'tag',
	create: (v: ExpNumber = createNumber(0)) => v,
	body: {
		type: 'number',
		default: () => createNumber(0),
	},
}

const ExpTagString: ExpTag = {
	literal: 'tag',
	create: (v: ExpString = createString('')) => v,
	body: {
		type: 'string',
		default: () => createString(''),
	},
}

const ExpTagKeyword: ExpTag = {
	literal: 'tag',
	create: (v: ExpKeyword = createKeyword('_')) => v,
	body: {
		type: 'keyword',
		default: () => createKeyword('_'),
	},
}

const ExpTagHashMap: ExpTag = {
	literal: 'tag',
	create: (v: ExpHashMap = createHashMap({})) => v,
	body: {
		type: 'hashMap',
		default: () => createHashMap({}),
	},
}

const ExpTagTag: ExpTag = {
	literal: 'tag',
	body: {
		type: 'tag',
		default: () => ExpTagAny,
	},
}

const ReservedSymbols: {[name: string]: ExpForm} = {
	Any: ExpTagAny,
	Null: ExpTagNull,
	Boolean: ExpTagBoolean,
	Number: ExpTagNumber,
	String: ExpTagString,
	Keyword: ExpTagKeyword,
	Tag: ExpTagTag,
	let: createFn(
		(_, body: ExpForm) => {
			return body
		},
		{
			literal: 'tag',
			body: {
				type: 'fn',
				params: [ExpTagHashMap, ExpTagAny],
				return: ExpTagAny,
			},
		}
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		// Vec2: {
		// 	literal: 'tag',
		// 	constructor: (
		// 		x: ExpNumber = createNumber(0),
		// 		y: ExpNumber = createNumber(0)
		// 	) => createRaw(new Float32Array([x.value, y.value])),
		// },
		PI: createNumber(Math.PI),
		'+': createFn((x: any, y: any) => createNumber(x.value + y.value), {
			literal: 'tag',
			body: {
				type: 'fn',
				params: [ExpTagNumber, ExpTagNumber],
				return: ExpTagNumber,
			},
		}),
		not: createFn((v: any) => createBoolean(!v.value), {
			literal: 'tag',
			body: {
				type: 'fn',
				params: [ExpTagBoolean],
				return: ExpTagBoolean,
			},
		}),
		'resolve-tag': createFn((v: any) => resolveTag(v), {
			literal: 'tag',
			body: {
				type: 'fn',
				params: [ExpTagAny],
				return: ExpTagTag,
			},
		}),
		type: createFn((v: any) => createString(v.type), {
			literal: 'tag',
			body: {
				type: 'fn',
				params: [ExpTagAny],
				return: ExpTagString,
			},
		}),
	})
)

function combineTag(base: ExpTag, target: ExpTag): ExpTag {
	const superior =
		base.body.type !== 'any' && target.body.type === 'any' ? base : target

	const create = superior.create
	const body = superior.body

	return {
		literal: 'tag',
		create,
		body,
	}
}

function getIntrinsticTag(exp: ExpForm): ExpTag {
	switch (exp.literal) {
		case 'null':
			return ExpTagNull
		case 'boolean':
			return ExpTagBoolean
		case 'number':
			return ExpTagNumber
		case 'string':
			return ExpTagString
		default:
			return ExpTagAny
	}
}

function resolveTag(exp: ExpForm): ExpTag {
	let expTag: ExpTag = ExpTagAny
	let baseTag: ExpTag = ExpTagAny

	// Check if the expression itself has a tag
	if (exp.tag) {
		const tag: ExpForm = evalExp(exp.tag.value)

		if (tag.literal !== 'tag') {
			throw new Error('Invalid tag')
		}
		expTag = tag
	}

	if (expTag.body.type === 'any') {
		expTag = getIntrinsticTag(exp)
	}

	if (exp.parent) {
		const {parent} = exp

		if (parent.literal === 'list') {
			const index = parent.value.indexOf(exp) - 1
			if (index >= 0) {
				// Is the part of param
				const fn = evalExp(parent.value[0])
				const fnTag = resolveTag(fn)
				if (fnTag.body.type !== 'fn') {
					throw new Error('Mismatch fn tag')
				}
				baseTag = fnTag.body.params[index]
			}
		}
	}

	return combineTag(baseTag, expTag)
}

function cloneExp<T extends ExpForm>(exp: T) {
	return deepClone(exp)
}

function clearEvaluated(exp: ExpForm) {
	switch (exp.literal) {
		case 'symbol':
		case 'list':
		case 'vector':
		case 'hashMap':
			if (!exp.evaluated) {
				return
			}
			delete exp.evaluated
	}

	if (exp.dup) {
		exp.dup.forEach(clearEvaluated)
	}
}

export function evalExp(exp: ExpForm): ExpForm {
	exp.parent = GlobalScope
	return evalWithTrace(exp, [])

	function matchTag(tag: ExpTag, candidate: ExpTag): ExpTag | null {
		// Exact match
		if (candidate === tag) {
			return candidate
		}

		// Any match
		if (candidate.body.type === 'any') {
			return tag
		}

		if (candidate.body.type === tag.body.type) {
			return tag
		}

		return null
	}

	function resolveSymbol(sym: ExpSymbol): ExpForm {
		if (sym.value in ReservedSymbols) {
			return ReservedSymbols[sym.value]
		}

		if (sym.ref) {
			return sym.ref
		}

		let ref: ExpForm | undefined
		let parent: ExpForm | undefined = sym

		while ((parent = parent.parent)) {
			if (isListOf('let', parent)) {
				const vars = parent.value[1]

				if (vars.literal !== 'hashMap') {
					throw new Error('2nd parameter of let should be HashMap')
				}

				if ((ref = vars.value[sym.value])) {
					break
				}
			}
		}

		if (!ref) {
			throw new Error(`Symbol ${printExp(sym)} is not defined`)
		}

		sym.ref = ref
		ref.dup = (ref.dup || new Set()).add(sym)

		return ref
	}

	function evalWithTrace(exp: ExpForm, trace: ExpForm[]): ExpForm {
		// Check circular reference
		if (trace.includes(exp)) {
			const lastTrace = trace[trace.length - 1]
			throw new Error(`Circular reference ${printExp(lastTrace)}`)
		}
		trace = [...trace, exp]

		switch (exp.literal) {
			case 'null':
			case 'boolean':
			case 'number':
			case 'string':
			case 'keyword':
			case 'fn':
			case 'tag':
				return exp
			case 'symbol': {
				const ref = resolveSymbol(exp)
				return (exp.evaluated = evalWithTrace(ref, trace))
			}
			case 'list': {
				const [first, ...rest] = exp.value

				// Check Special form
				if (first.literal === 'symbol') {
					switch (first.value) {
						case 'tag': {
							// Create a tag
							const [tagType, ...tagRest] = rest.map(r =>
								evalWithTrace(r, trace)
							)

							if (tagType.literal !== 'keyword') {
								throw new Error('First parameter of : should be keyword')
							}

							switch (tagType.value) {
								case 'Any':
									return ExpTagAny
								case 'Null':
									return ExpTagNull
								case 'Boolean':
									return ExpTagBoolean
								case 'Number':
									return ExpTagNumber
								case 'String':
									return ExpTagString
								case 'Tag':
									return ExpTagTag
								case 'Fn': {
									const [params, ret] = tagRest

									if (params.literal !== 'vector') {
										throw new Error('Parameter should be vector')
									}
									if (!params.value.every(p => p.literal === 'tag')) {
										throw new Error('Every parameter should be tag')
									}
									if (ret.literal !== 'tag') {
										throw new Error('Return type should be tag')
									}

									return {
										literal: 'tag',
										body: {
											type: 'fn',
											params: params.value as ExpTag[],
											return: ret,
										},
									}
								}
							}

							throw new Error('Invalid type')
						}
						case 'fn': {
							// Create a function
							const [paramsDefinition, bodyDefinition] = rest
							if (paramsDefinition.literal !== 'hashMap') {
								throw new Error('Function parameter should be hash map')
							}

							const paramsHashMap = cloneExp(paramsDefinition)

							const fnScope = createList(
								createSymbol('let'),
								paramsHashMap,
								cloneExp(bodyDefinition)
							)

							fnScope.parent = exp.parent

							const paramsKeys = Object.keys(paramsDefinition.value)
							const paramsLength = paramsKeys.length

							const fn = (...params: ExpForm[]) => {
								// Set params
								paramsKeys.forEach(
									(sym, i) => (paramsHashMap.value[sym] = params[i])
								)

								// Evaluate
								const ret = evalWithTrace(fnScope, trace)

								// Clean params
								paramsKeys.forEach(sym =>
									clearEvaluated(paramsHashMap.value[sym])
								)

								return ret
							}

							return (exp.evaluated = createFn(fn, {
								literal: 'tag',
								body: {
									type: 'fn',
									params: Array(paramsLength)
										.fill(null)
										.map(() => cloneExp(ExpTagAny)),
									return: cloneExp(ExpTagAny),
								},
							}))
						}
						case 'quote':
							if (!rest[0]) {
								throw new Error('quote needs 1 parameters')
							}
							return rest[0]
					}
				}

				const fn = evalWithTrace(first, trace)

				let expanded: ExpForm

				if (fn.literal === 'fn') {
					// Function application
					const fnTag = resolveTag(fn)

					if (fnTag.body.type !== 'fn') {
						throw new Error(`Not a fn tag but ${fnTag.body.type}`)
					}

					const paramsTag = rest.map(resolveTag)

					const match = fnTag.body.params
						.map((pt, i) => matchTag(paramsTag[i], pt))
						.every(t => !!t)

					if (!match) {
						throw new Error('Invalid parameter!!!!!!')
					}

					expanded = fn.value(...rest.map(p => evalWithTrace(p, trace)))
				} else if (fn.literal === 'tag') {
					// Constructor

					if (!fn.create) {
						throw new Error('Tag is not callable')
					}
					expanded = fn.create(...rest.map(p => evalWithTrace(p, trace)))
				} else {
					throw new Error(`${printExp(first)} is not callable`)
				}

				exp.expanded = expanded

				return (exp.evaluated = evalWithTrace(expanded, trace))
			}
			case 'vector': {
				return (exp.evaluated = createVector(
					...exp.value.map(v => evalWithTrace(v, trace))
				))
			}
			case 'hashMap': {
				const ret: ExpHashMap = {
					literal: 'hashMap',
					value: {},
				}
				Object.entries(exp.value).forEach(
					([sym, v]) => (ret.value[sym] = evalWithTrace(v, trace))
				)

				return (exp.evaluated = ret)
			}
			default:
				return createNull()
		}
	}
}

// Create functions
function createNull(): ExpNull {
	return {literal: 'null'}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		literal: 'boolean',
		value,
	}
}

function createNumber(value: number): ExpNumber {
	return {
		literal: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		literal: 'string',
		value,
	}
}

function createKeyword(value: string): ExpKeyword {
	return {
		literal: 'keyword',
		value,
	}
}

function createSymbol(value: string): ExpSymbol {
	return {
		literal: 'symbol',
		value,
	}
}

function createFn(
	value: string | ((...params: ExpForm[]) => ExpForm),
	tag?: ExpTag
): ExpFn {
	const fn: ExpFn = {
		literal: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
	}

	if (tag) {
		fn.tag = {value: tag}
		tag.parent = fn
	}

	return fn
}

function createList(...value: ExpForm[]): ExpList {
	const exp: ExpList = {
		literal: 'list',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createVector(...value: ExpForm[]): ExpVector {
	const exp: ExpVector = {
		literal: 'vector',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createHashMap(value: ExpHashMap['value']): ExpHashMap {
	const exp: ExpHashMap = {
		literal: 'hashMap',
		value,
	}
	Object.values(value).forEach(v => (v.parent = exp))

	return exp
}

function isListOf(sym: string, exp: ExpForm): exp is ExpList {
	if (exp.literal === 'list') {
		const [first] = exp.value
		return first && first.literal === 'symbol' && first.value === sym
	}
	return false
}

export function printExp(form: ExpForm): string {
	if (form.tag) {
		const {tag} = form
		const [d0, d1] = tag.delimiters || ['', ' ']
		return '^' + d0 + printExp(tag.value) + d1 + printWithoutTag(form)
	} else {
		return printWithoutTag(form)
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (SymbolIdentiferRegex.test(value)) {
			return {literal: 'symbol', value, str: value}
		} else {
			return {literal: 'string', value}
		}
	}

	function printWithoutTag(exp: ExpForm): string {
		switch (exp.literal) {
			case 'null':
				return 'null'
			case 'boolean':
				return exp.value ? 'true' : 'false'
			case 'number':
				return exp.str || exp.value.toString()
			case 'string':
				return '"' + exp.value + '"'
			case 'keyword':
				return ':' + exp.value
			case 'symbol':
				if (exp.str) {
					return exp.str
				} else {
					const {value} = exp
					return SymbolIdentiferRegex.test(value) ? value : `@"${value}"`
				}
			case 'list': {
				return printSeq('(', ')', exp.value, exp.delimiters)
			}
			case 'vector':
				return printSeq('[', ']', exp.value, exp.delimiters)
			case 'hashMap': {
				const {value, keyQuoted, delimiters} = exp
				const keys = Object.keys(value)

				let keyForms: (ExpSymbol | ExpString)[]

				if (keyQuoted) {
					keyForms = keys.map(k =>
						keyQuoted[k] ? createString(k) : createSymbol(k)
					)
				} else {
					keyForms = keys.map(toHashKey)
				}

				let flattenDelimiters: string[]
				let coll: ExpForm[]
				if (delimiters) {
					coll = keys
						.map((k, i) =>
							Array.isArray(delimiters[i + 1])
								? [keyForms[i], value[k]]
								: [value[k]]
						)
						.flat()
					flattenDelimiters = delimiters.flat()
				} else {
					coll = keys.map((k, i) => [keyForms[i], value[k]]).flat()
					flattenDelimiters = [
						'',
						...Array(keys.length - 1)
							.fill([': ', ' '])
							.flat(),
						': ',
						'',
					]
				}

				return printSeq('{', '}', coll, flattenDelimiters)
			}
			case 'fn':
				return 'fn'
			case 'tag':
				switch (exp.body.type) {
					case 'any':
					case 'null':
					case 'boolean':
					case 'number':
					case 'string':
					case 'tag':
						return capital(exp.body.type)
					case 'fn': {
						const params = exp.body.params.map(printWithoutTag).join(' ')
						const ret = printWithoutTag(exp.body.return)
						return `(: #Fn [${params}] ${ret})`
					}
					default:
						console.log(exp)
						throw new Error('Cannot print tag')
				}
			default:
				throw new Error('Invalid type of Exp')
		}
	}

	function printSeq(
		start: string,
		end: string,
		coll: ExpForm[],
		delimiters?: string[]
	): string {
		if (delimiters) {
			if (delimiters.length === coll.length + 1) {
				return (
					start +
					coll.map((v, i) => delimiters[i] + printExp(v)).join('') +
					delimiters[delimiters.length - 1] +
					end
				)
			}
			console.warn('Invalid length of delimiters')
		}
		return start + coll.map(printExp).join(' ') + end
	}
}
