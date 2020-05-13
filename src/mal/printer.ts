import {
	MalVal,
	MalAtom,
	isMalFunc,
	isKeyword,
	isSymbol,
	M_PARAMS,
	M_AST,
	isMap,
	isList,
	isVector,
	M_ISMACRO,
	isMalNode,
	M_ELMSTRS,
	M_DELIMITERS,
	M_ISSUGAR,
	M_KEYS
} from './types'

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

function toFixed(x: number) {
	if (Math.abs(x) < 1.0) {
		const e = parseInt(x.toString().split('e-')[1])
		if (e) {
			x *= Math.pow(10, e - 1)
			return '0.' + new Array(e).join('0') + x.toString().substring(2)
		}
	} else {
		let e = parseInt(x.toString().split('+')[1])
		if (e > 20) {
			e -= 20
			x /= Math.pow(10, e)
			return x + new Array(e + 1).join('0')
		}
	}
	return x.toString()
}

export default function printExp(
	exp: MalVal,
	printReadably = true,
	cache = false
): string {
	const _r = printReadably
	const _c = cache

	let ret: string

	if (isMalNode(exp) && M_ELMSTRS in exp) {
		// Print using cache

		const delimiters = exp[M_DELIMITERS]
		const elmStrs = exp[M_ELMSTRS]

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
				ret += delimiters[i * 2] + printExp(keys[i]) + delimiters[i * 2 + 1]

				if (!elmStrs[i]) {
					elmStrs[i] = printExp(exp[keys[i]], _r, _c)
				}
				ret += elmStrs[i]
			}
			ret += delimiters[delimiters.length - 1]

			ret = '{' + ret + '}'
		}
	} else {
		// Calculate from zero

		let elmStrs: string[] | null = null

		if (isList(exp)) {
			elmStrs = exp.map(e => printExp(e, _r, _c))
			ret = '(' + elmStrs.join(' ') + ')'
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
		} else if (typeof exp === 'number') {
			ret = toFixed(exp)
		} else if (typeof exp === 'boolean') {
			ret = exp.toString()
		} else if (exp instanceof MalAtom) {
			ret = '(atom ' + printExp(exp.val, _r, _c) + ')'
		} else if (typeof exp === 'function') {
			ret = exp.toString()
		} else if (exp === undefined) {
			ret = '<undefined>'
		} else {
			ret = `<native objects>`
		}

		if (_c && isMalNode(exp) && elmStrs) {
			if (!exp[M_ELMSTRS]) {
				exp[M_ELMSTRS] = elmStrs
			}

			if (!exp[M_DELIMITERS]) {
				const spaceCount = Math.max(0, elmStrs.length - 1)
				exp[M_DELIMITERS] = ['', ...Array(spaceCount).fill(' '), '']
			}
		}
	}

	return ret
}
