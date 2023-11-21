import {
	getType,
	isAtom,
	isFunc,
	isKeyword,
	isList,
	isMap,
	isSeq,
	isSymbol,
	M_AST,
	M_DELIMITERS,
	M_ELMSTRS,
	M_ISMACRO,
	M_ISSUGAR,
	M_PARAMS,
	MalNode,
	MalType,
	MalVal,
} from './types'

export const printer = {
	log: (...args: any) => {
		// eslint-disable-next-line no-console
		console.info(...args)
	},
	return: (...args: any) => {
		// eslint-disable-next-line no-console
		console.log(...args)
	},
	error: (...args: any) => {
		// eslint-disable-next-line no-console
		console.error(...args)
	},
	pseudoExecute: (command: string) => {
		// eslint-disable-next-line no-console
		console.log(command)
	},
	// eslint-disable-next-line no-console
	clear: console.clear,
}

function generateDefaultDelimiters(elementCount: number) {
	if (elementCount === 0) {
		return ['']
	} else {
		return ['', ...Array(elementCount - 1).fill(' '), '']
	}
}

const SUGAR_INFO = new Map<string, {prefix: string}>([
	['quote', {prefix: "'"}],
	['with-meta-sugar', {prefix: '^'}],
	['fn-sugar', {prefix: '#'}],
	['quasiquote', {prefix: '`'}],
	['unquote', {prefix: '~'}],
	['unquote-splicing', {prefix: '~@'}],
	['deref', {prefix: '@'}],
])

export default function printExp(exp: MalVal, printReadably = true): string {
	const _r = printReadably

	const type = getType(exp)

	const isExpList = isList(exp)
	const isExpSeq = isSeq(exp)

	if (isExpList || isMap(exp)) {
		// Collection

		const sugarInfo =
			isExpList && SUGAR_INFO.get(isSymbol(exp[0]) ? exp[0].value : '')

		if (sugarInfo /* && !(M_ISSUGAR in coll)*/) {
			exp[M_ISSUGAR] = true
			exp[M_ELMSTRS] = [
				sugarInfo.prefix,
				...exp.slice(1).map(e => printExp(e, _r)),
			]
			exp[M_DELIMITERS] = Array(exp.length + 1).fill('')
		} else {
			// Creates a cache if there's no element text cache
			if (!(M_ELMSTRS in exp)) {
				let elmStrs: string[]

				if (isExpSeq) {
					elmStrs = exp.map(e => printExp(e, _r))
					if (sugarInfo) {
						elmStrs[0] = ''
					}
				} else {
					// NOTE: This might change the order of key
					elmStrs = Object.entries(exp)
						.map(([key, value]) => [printExp(key, _r), printExp(value, _r)])
						.flat()
				}
				;(exp as MalNode)[M_ELMSTRS] = elmStrs
			}

			// Creates a cache for delimiters if it does not exist
			if (!(M_DELIMITERS in exp)) {
				let delimiters: string[]

				if (isExpSeq) {
					delimiters = generateDefaultDelimiters(exp.length)
				} else {
					// Map
					delimiters = generateDefaultDelimiters(Object.keys(exp).length * 2)
				}

				;(exp as MalNode)[M_DELIMITERS] = delimiters
			}
		}

		// Print using cache
		const elmStrs = (exp as MalNode)[M_ELMSTRS]
		const delimiters = (exp as MalNode)[M_DELIMITERS]

		let ret = ''
		for (let i = 0; i < elmStrs.length; i++) {
			ret += delimiters[i] + elmStrs[i]
		}
		ret += delimiters[delimiters.length - 1]

		switch (type) {
			case MalType.List:
				if (sugarInfo) {
					return ret
				} else {
					return '(' + ret + ')'
				}
			case MalType.Vector:
				return '[' + ret + ']'
			default:
				// Map
				return '{' + ret + '}'
		}
	} else if (typeof exp === 'number') {
		return exp.toFixed(4).replace(/\.?[0]+$/, '')
	} else if (typeof exp === 'boolean') {
		return exp.toString()
	} else if (exp === null) {
		return 'nil'
	} else if (isSymbol(exp)) {
		return exp.value
	} else if (isKeyword(exp)) {
		return ':' + exp.slice(1)
	} else if (isFunc(exp)) {
		if (M_AST in exp) {
			const params = printExp(exp[M_PARAMS], _r)
			const body = printExp(exp[M_AST], _r)
			const symbol = exp[M_ISMACRO] ? 'macro' : 'fn'
			return `(${symbol} ${params} ${body})`
		} else {
			return '<JS Function>'
		}
	} else if (isAtom(exp)) {
		return `(atom ${printExp(exp.value, _r)})`
	} else {
		return '<undefined>'
	}
}
