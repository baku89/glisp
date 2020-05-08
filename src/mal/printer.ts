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
	M_ISMACRO,
	isMalNode,
	M_STR,
	M_ELMSTRS,
	M_DELIMITERS,
	M_ISSUGAR,
	M_KEYS
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

export default function printExp(
	exp: MalVal,
	printReadably = true,
	cache = false
): string {
	const _r = printReadably
	const _c = cache

	let ret: string
	let elmStrs: string[] | null = null

	if (isMalNode(exp) && exp[M_STR]) {
		ret = exp[M_STR]
	} else if (isMalNode(exp) && exp[M_ELMSTRS]) {
		const delimiters = exp[M_DELIMITERS]
		elmStrs = exp[M_ELMSTRS]

		if (Array.isArray(exp)) {
			const count = elmStrs.length
			ret = ''
			for (let i = 0; i < count; i++) {
				ret += delimiters[i]
				if (!elmStrs[i]) {
					elmStrs[i] = printExp(exp[i], _r, _c)
				}
				ret += elmStrs[i]
			}
			ret += delimiters[count]

			if (!exp[M_ISSUGAR]) {
				if (isList(exp)) {
					ret = '(' + ret + ')'
				} else if (isVector(exp)) {
					ret = '[' + ret + ']'
				}
			}
		} else {
			// Map
			const keys = exp[M_KEYS]
			const count = keys.length
			ret = ''

			for (let i = 0; i < count; i++) {
				ret += delimiters[i * 2] + elmStrs[i * 2] + delimiters[i * 2 + 1]

				if (!elmStrs[i * 2 + 1]) {
					elmStrs[i * 2 + 1] = printExp(exp[keys[i]], _r, _c)
				}
				ret += elmStrs[i * 2 + 1]
			}
			ret += delimiters[delimiters.length - 1]

			ret = '{' + ret + '}'
		}
	} else if (isList(exp)) {
		// if (exp.length === 2) {
		// 	switch (exp[0]) {
		// 		case S_QUOTE:
		// 			ret = "'" + printExp(exp[1], _r, _c)
		// 			break
		// 		case S_QUASIQUOTE:
		// 			ret = '`' + printExp(exp[1], _r, _c)
		// 			break
		// 		case S_UNQUOTE:
		// 			ret = '~' + printExp(exp[1], _r, _c)
		// 			break
		// 		case S_SPLICE_UNQUOTE:
		// 			ret = '~@' + printExp(exp[1], _r, _c)
		// 			break
		// 		default:
		// 			ret = '(' + exp.map(e => printExp(e, _r, _c)).join(' ') + ')'
		// 			break
		// 	}
		// } else {
		elmStrs = exp.map(e => printExp(e, _r, _c))
		ret = '(' + elmStrs.join(' ') + ')'
		// }
	} else if (isVector(exp)) {
		elmStrs = exp.map(e => printExp(e, _r, _c))
		ret = '[' + elmStrs.join(' ') + ']'
	} else if (isMap(exp)) {
		elmStrs = []
		for (const k in exp) {
			elmStrs.push(printExp(k, _r, _c), printExp(exp[k], _r, _c))
		}
		ret = '{' + elmStrs.join(' ') + '}'
	} else if (typeof exp === 'string') {
		if (isSymbol(exp)) {
			ret = exp.slice(1)
		} else if (isKeyword(exp)) {
			ret = ':' + (exp as string).slice(1)
		} else if (_r) {
			ret =
				'"' +
				(exp as string)
					.replace(/\\/g, '\\\\')
					.replace(/"/g, '\\"')
					.replace(/\n/g, '\\n') +
				'"'
		} else {
			ret = exp
		}
	} else if (exp === null) {
		ret = 'nil'
	} else if (isMalFunc(exp)) {
		const params = printExp(exp[M_PARAMS], _r, _c)
		const body = printExp(exp[M_AST], _r, _c)
		ret = `(${exp[M_ISMACRO] ? 'macro' : 'fn'} ${params} ${body})`
	} else if (typeof exp === 'number' || typeof exp === 'boolean') {
		ret = exp.toString()
	} else if (exp instanceof MalAtom) {
		ret = '(atom ' + printExp(exp.val, _r, _c) + ')'
	} else if (typeof exp === 'function') {
		ret = exp.toString()
	} else if (exp === undefined) {
		ret = '<undefined>'
	} else {
		ret = `<${exp.constructor.name}>`
	}

	if (_c && isMalNode(exp) && elmStrs) {
		// Cache
		exp[M_STR] = ret

		if (!exp[M_ELMSTRS]) {
			exp[M_ELMSTRS] = elmStrs
		}

		if (!exp[M_DELIMITERS]) {
			exp[M_DELIMITERS] = ['', ...Array(elmStrs.length - 1).fill(' '), '']
		}
	}

	return ret
}
