import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

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
}

interface ExpList extends ExpBase {
	type: 'list'
	fn: ExpSymbol | ExpList
	params: ExpForm[]
	delimiters?: string[]
	evaluated: ExpForm
}

interface ExpVector extends ExpBase {
	type: 'vector'
	value: ExpForm[]
	delimiters?: string[]
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
}

interface ExpScope extends ExpBase {
	type: 'scope'
	vars: ExpHashMap
	ret: ExpForm
	delimiters?: string[]
}

export function readStr(str: string) {
	const exp = parser.parse(str) as ExpProgram
	console.log(exp.value)
	return printExp(exp.value)
}

export function printExp(form: ExpForm): string {
	if (form.meta) {
		const {meta} = form
		const [d0, d1] = meta.delimiters || ['', ' ']
		return '^' + d0 + printExp(meta.value) + d1 + printWithoutMeta(form)
	} else {
		return printWithoutMeta(form)
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (/^[a-z_+\-*/=?<>][a-z0-9_+\-*/=?<>]*$/i.test(value)) {
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
			case 'scope': {
				const coll = [form.vars, form.ret]
				return printCollection('{', '}', coll, form.delimiters)
			}
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
