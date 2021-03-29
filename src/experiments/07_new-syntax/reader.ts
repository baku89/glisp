import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

export function readStr(str: string) {
	return parser.parse(str)
}
