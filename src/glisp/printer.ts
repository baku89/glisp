import {
	isAtom,
	isFunc,
	isKeyword,
	isList,
	isMap,
	isSeq as isVector,
	isSymbol,
	M_AST,
	M_ISMACRO,
	M_ISSUGAR,
	M_PARAMS,
	Expr,
	ExprList as ExprList,
} from './types'
import {getDelimiters, insertDelimiters} from './utils'

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

export function generateDefaultDelimiters(elementCount: number) {
	if (elementCount === 0) {
		return ['']
	} else {
		return ['', ...Array(elementCount - 1).fill(' '), '']
	}
}

const NameForSugarSymbol = new Map<string, string>([
	['quote', "'"],
	['with-meta-sugar', '^'],
	['fn-sugar', '#'],
	['quasiquote', '`'],
	['unquote', '~'],
	['unquote-splicing', '~@'],
	['deref', '@'],
])

/**
 * 糖衣構文のキャラクタを返す。そのリストが糖衣構文かどうかは、パース時に既に決定されている
 */
export function getSugarPrefix(exp: ExprList): string | null {
	if (!exp[M_ISSUGAR]) {
		return null
	}

	const first = exp[0]

	if (!isSymbol(first)) {
		throw new Error('Invalid syntactic sugar')
	}

	const sugarSymbol = NameForSugarSymbol.get(first.value)

	if (!sugarSymbol) {
		throw new Error('Invalid syntactic sugar')
	}

	return sugarSymbol
}

export default function printExp(exp: Expr): string {
	const isExpList = isList(exp)
	const isExpVector = isVector(exp)

	let elmStrs: string[] | undefined

	if (isExpList || isMap(exp)) {
		// Collection
		// Check if there's a syntactic sugar
		if (isExpList) {
			const sugarPrefix = getSugarPrefix(exp)

			if (sugarPrefix) {
				elmStrs = [sugarPrefix, ...exp.slice(1).map(printExp)]
			}
		}

		if (!elmStrs) {
			if (isExpVector) {
				elmStrs = exp.map(printExp)
			} else {
				elmStrs = Object.entries(exp).flat().map(printExp)
			}
		}

		const delimiters = getDelimiters(exp)

		const content = insertDelimiters(elmStrs, delimiters)

		if (isExpList) {
			return exp[M_ISSUGAR] ? content : '(' + content + ')'
		} else if (isExpVector) {
			return '[' + content + ']'
		} else {
			return '{' + content + '}'
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
			const params = printExp(exp[M_PARAMS])
			const body = printExp(exp[M_AST])
			const symbol = exp[M_ISMACRO] ? 'macro' : 'fn'
			return `(${symbol} ${params} ${body})`
		} else {
			return '<JS Function>'
		}
	} else if (isAtom(exp)) {
		return `(atom ${printExp(exp.value)})`
	} else {
		return '<undefined>'
	}
}
