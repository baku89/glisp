import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^[a-z_+\-*/=?<>][0-9a-z_+\-*/=?<>]*$/i

type ExpForm =
	| ExpNil
	| ExpBoolean
	| ExpNumber
	| ExpString
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpScope
	| ExpFn
	| ExpValueType
	| ExpRaw

interface ExpProgram {
	type: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpBase {
	parent?: ExpList | ExpVector | ExpHashMap | ExpScope
	meta?: {
		value: ExpHashMap
		delimiters?: string[]
	}
	dup?: ExpSymbol[]
}

interface ExpNil extends ExpBase {
	type: 'nil'
}

interface ExpBoolean extends ExpBase {
	type: 'boolean'
	value: boolean
}

interface ExpNumber extends ExpBase {
	type: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	type: 'string'
	value: string
}

interface ExpSymbol extends ExpBase {
	type: 'symbol'
	value: string
	str?: string
	ref?: ExpForm
	evaluated?: ExpForm
}

interface ExpList extends ExpBase {
	type: 'list'
	fn: ExpSymbol | ExpList
	params: ExpForm[]
	delimiters?: string[]
	expanded?: ExpForm
	evaluated?: ExpForm
}

interface ExpVector extends ExpBase {
	type: 'vector'
	value: ExpForm[]
	delimiters?: string[]
	evaluated?: ExpVector
}

interface ExpHashMap extends ExpBase {
	type: 'hashMap'
	value: {
		[key: string]: ExpForm
	}
	key?: {
		[key: string]: ExpString | ExpSymbol
	}
	delimiters?: string[]
	evaluated?: ExpHashMap
}

interface ExpScope extends ExpBase {
	type: 'scope'
	vars: ExpHashMap
	ret: ExpForm
	delimiters?: string[]
	evaluated?: ExpForm
}

interface ExpValueType {
	parent?: ExpList | ExpVector | ExpHashMap | ExpScope
	type: 'valueType'
	constructor: (...params: any[]) => ExpForm
	predicate?: (form: ExpForm) => ExpBoolean
}

interface ExpFn extends ExpBase {
	type: 'fn'
	value: (...params: ExpForm[]) => ExpForm
}

interface ExpRaw {
	type: 'raw'
	parent?: ExpList | ExpVector | ExpHashMap | ExpScope
	value: any
}

export function readStr(str: string): ExpForm {
	const exp = parser.parse(str) as ExpProgram
	return exp.value
}

const GlobalScope = createScope({
	Any: {
		type: 'valueType',
		constructor: (v: ExpForm = createNil()) => v,
		predicate: () => createBoolean(true),
	},
	Number: {
		type: 'valueType',
		constructor: (v: ExpNumber = createNumber(0)) => v,
		predicate: (v: ExpForm) => createBoolean(v.type === 'number'),
	},
	String: {
		type: 'valueType',
		constructor: (v: ExpString = createString('')) => v,
		predicate: (v: ExpForm) => createBoolean(v.type === 'string'),
	},
	Vec2: {
		type: 'valueType',
		constructor: (
			x: ExpNumber = createNumber(0),
			y: ExpNumber = createNumber(0)
		) => createRaw(new Float32Array([x.value, y.value])),
	},
	PI: createNumber(Math.PI),
	'+': createFn((...xs: any[]) =>
		createNumber(xs.reduce((s, {value}) => s + value, 0))
	),
})

export function evalExp(exp: ExpForm): ExpForm {
	exp.parent = GlobalScope
	return _eval(exp, new Set())

	function _eval(exp: ExpForm, dup: Set<ExpForm>): ExpForm {
		// Check circular reference
		if (dup.has(exp)) {
			const dupArr = Array.from(dup)
			const lastSymbol = dupArr[dupArr.length - 1]
			throw new Error(`Circular reference ${printExp(lastSymbol)}`)
		}

		dup = new Set(dup).add(exp)

		switch (exp.type) {
			case 'nil':
			case 'boolean':
			case 'number':
			case 'string':
			case 'fn':
			case 'valueType':
				return exp
			case 'symbol': {
				let ref: ExpForm | undefined = undefined
				let parent: ExpForm | undefined = exp

				while ((parent = parent.parent)) {
					if (parent.type === 'scope') {
						if ((ref = parent.vars.value[exp.value])) {
							break
						}
					}
				}

				if (!ref) {
					throw new Error(`Symbol ${printExp(exp)} is not defined`)
				}

				exp.ref = ref
				return (exp.evaluated = _eval(ref, dup))
			}
			case 'scope':
				return _eval(exp.ret, dup)
			case 'list': {
				const fn = _eval(exp.fn, dup)

				let expanded: ExpForm

				if (fn.type === 'fn') {
					expanded = fn.value(...exp.params.map(p => _eval(p, dup)))
				} else if (fn.type === 'valueType') {
					expanded = fn.constructor(...exp.params.map(p => _eval(p, dup)))
				} else {
					throw new Error(`${printExp(exp.fn)} is not a function`)
				}

				exp.expanded = expanded

				return (exp.evaluated = _eval(expanded, dup))
			}
			case 'vector': {
				return (exp.evaluated = createVector(
					...exp.value.map(v => _eval(v, dup))
				))
			}
			default:
				return {type: 'nil'}
		}
	}
}

function createSymbol(value: string): ExpSymbol {
	const str = SymbolIdentiferRegex.test(value) ? value : `@"${value}"`

	return {
		type: 'symbol',
		value,
		str,
	}
}

function createNil(): ExpNil {
	return {type: 'nil'}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		type: 'boolean',
		value,
	}
}

function createNumber(value: number): ExpNumber {
	return {
		type: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		type: 'string',
		value,
	}
}

function createFn(value: string | ((...params: ExpForm[]) => ExpForm)): ExpFn {
	return {
		type: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
	}
}

function createVector(...value: ExpForm[]): ExpVector {
	return {
		type: 'vector',
		value,
	}
}

function createScope(
	vars: {[key: string]: ExpForm},
	ret: ExpForm = createNil()
): ExpScope {
	const exp: ExpScope = {
		type: 'scope',
		vars: {
			type: 'hashMap',
			value: vars,
		},
		ret,
	}

	Object.values(vars).forEach(v => (v.parent = exp))
	ret.parent = exp

	return exp
}

function createRaw(value: any): ExpRaw {
	return {
		type: 'raw',
		value,
	}
}

export function printExp(form: ExpForm): string {
	if ('meta' in form && form.meta) {
		const {meta} = form
		const [d0, d1] = meta.delimiters || ['', ' ']
		return '^' + d0 + printExp(meta.value) + d1 + printWithoutMeta(form)
	} else {
		return printWithoutMeta(form)
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (SymbolIdentiferRegex.test(value)) {
			return {type: 'symbol', value, str: value}
		} else {
			return {type: 'string', value}
		}
	}

	function printWithoutMeta(form: ExpForm): string {
		switch (form.type) {
			case 'nil':
				return 'nil'
			case 'boolean':
				return form.value ? 'true' : 'false'
			case 'number':
				return form.str || form.value.toString()
			case 'string':
				return '"' + form.value + '"'
			case 'symbol':
				return form.str || form.value
			case 'scope': {
				const coll = [createSymbol('let'), form.vars, form.ret]
				return printCollection('{', '}', coll, form.delimiters)
			}
			case 'list': {
				const coll = [form.fn, ...form.params]
				return printCollection('(', ')', coll, form.delimiters)
			}
			case 'vector':
				return printCollection('[', ']', form.value, form.delimiters)
			case 'hashMap': {
				const keys = Object.keys(form.value)
				const keyForms = keys.map(k => (form.key ? form.key[k] : toHashKey(k)))
				const coll = Object.values(form.value)
					.map((v, i) => [keyForms[i], v])
					.flat()
				return printCollection('{', '}', coll, form.delimiters)
			}
			case 'fn':
				return 'FN'
			default:
				throw new Error('Invalid type of Exp')
		}
	}

	function printCollection(
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
