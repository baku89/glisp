import {
	MalVal,
	MalAtom,
	isMalFunc,
	isKeyword,
	isSymbol,
	symbolFor as S,
	M_PARAMS,
	M_AST,
	isMap,
	isList,
	isVector,
	M_ISMACRO
} from './types'

const S_QUOTE = S('quote'),
	S_QUASIQUOTE = S('quasiquote'),
	S_UNQUOTE = S('unquote'),
	S_SPLICE_UNQUOTE = S('splice-unquote')

export const printer = {
	log: (...args: any) => {
		console.info(...args)
	},
	return: (...args: any) => {
		console.log(...args)
	},
	error: (...args: any) => {
		console.error(...args)
	},
	clear: console.clear
}

export default function printExp(obj: MalVal, printReadably = true): string {
	const _r = printReadably

	if (isList(obj)) {
		if (obj.length === 2) {
			switch (obj[0]) {
				case S_QUOTE:
					return "'" + printExp(obj[1], _r)
				case S_QUASIQUOTE:
					return '`' + printExp(obj[1], _r)
				case S_UNQUOTE:
					return '~' + printExp(obj[1], _r)
				case S_SPLICE_UNQUOTE:
					return '~@' + printExp(obj[1], _r)
			}
		}
		return '(' + obj.map(e => printExp(e, _r)).join(' ') + ')'
	} else if (isVector(obj)) {
		return '[' + obj.map(e => printExp(e, _r)).join(' ') + ']'
	} else if (isMap(obj)) {
		const ret = []
		for (const k in obj) {
			ret.push(printExp(k, _r), printExp(obj[k], _r))
		}
		return '{' + ret.join(' ') + '}'
	} else if (typeof obj === 'string') {
		if (isSymbol(obj)) {
			return obj.slice(1)
		} else if (isKeyword(obj)) {
			return ':' + (obj as string).slice(1)
		} else if (_r) {
			return (
				'"' +
				(obj as string)
					.replace(/\\/g, '\\\\')
					.replace(/"/g, '\\"')
					.replace(/\n/g, '\\n') +
				'"'
			)
		} else {
			return obj
		}
	} else if (obj === null) {
		return 'nil'
	} else if (isMalFunc(obj)) {
		const params = printExp(obj[M_PARAMS], _r)
		const body = printExp(obj[M_AST], _r)
		return `(${obj[M_ISMACRO] ? 'macro' : 'fn'} ${params} ${body})`
	} else if (typeof obj === 'number' || typeof obj === 'boolean') {
		return obj.toString()
	} else if (obj instanceof MalAtom) {
		return '(atom ' + printExp(obj.val, _r) + ')'
	} else if (typeof obj === 'function') {
		return obj.toString()
	} else if (obj === undefined) {
		return '<undefined>'
	} else {
		return `<${obj.constructor.name}>`
	}
}
