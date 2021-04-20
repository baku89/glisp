import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Exp =
	| ExpValue
	| ExpSymbol
	| ExpReservedKeyword
	| ExpList
	| ExpVector
	| ExpHashMap

interface ExpValue {
	ast: 'value'
	value: null | boolean | number | string
}

interface ExpSymbol {
	ast: 'symbol'
	name: string
}

interface ExpReservedKeyword {
	ast: 'reservedKeyword'
	name: string
}

interface ExpList {
	ast: 'list'
	items: Exp[]
}

interface ExpVector {
	ast: 'vector'
	items: Exp[]
}

interface ExpHashMap {
	ast: 'hashMap'
	items: Exp[]
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return {
			ast: 'value',
			value: null,
		}
	} else {
		return exp
	}
}
