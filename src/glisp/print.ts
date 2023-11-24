import {M_AST, M_ISMACRO, M_PARAMS} from './symbols'
import {
	Expr,
	ExprList as ExprList,
	isAtom,
	isFunc,
	isKeyword,
	isList,
	isMap,
	isSeq as isVector,
	isSymbol,
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
	['with-meta-sugar', '^'],
	['curry', '#'],
	['quote', '`'],
	['unquote', '~'],
	['unquote-splicing', '~@'],
	['deref', '@'],
])

/**
 * 糖衣構文のキャラクタを返す。そのリストが糖衣構文かどうかは、パース時に既に決定されている
 */
export function getSugarPrefix(exp: ExprList): string | null {
	if (!exp.isSugar) {
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

export function printExpr(expr: Expr): string {
	const isExpList = isList(expr)
	const isExpVector = isVector(expr)

	if (isExpList || isExpVector || isMap(expr)) {
		// Collection
		let elmStrs: string[] | undefined

		// Check if there's a syntactic sugar
		if (isExpList) {
			const sugarPrefix = getSugarPrefix(expr)

			if (sugarPrefix) {
				elmStrs = [sugarPrefix, ...expr.slice(1).map(printExpr)]
			}
		}

		if (!elmStrs) {
			if (isExpVector) {
				elmStrs = expr.map(printExpr)
			} else {
				elmStrs = Object.entries(expr).flat().map(printExpr)
			}
		}

		const delimiters = getDelimiters(expr)

		const content = insertDelimiters(elmStrs, delimiters)

		if (isExpList) {
			return expr.isSugar ? content : '(' + content + ')'
		} else if (isExpVector) {
			return '[' + content + ']'
		} else {
			return '{' + content + '}'
		}
	} else if (typeof expr === 'number') {
		return expr.toFixed(4).replace(/\.?[0]+$/, '')
	} else if (typeof expr === 'boolean') {
		return expr.toString()
	} else if (typeof expr === 'string') {
		if (isKeyword(expr)) {
			return `:${expr.slice(1)}`
		} else {
			return `"${expr}"`
		}
	} else if (expr === null) {
		return 'null'
	} else if (isSymbol(expr)) {
		return expr.value
	} else if (isKeyword(expr)) {
		return ':' + expr.slice(1)
	} else if (isFunc(expr)) {
		if (M_AST in expr) {
			const params = printExpr(expr[M_PARAMS])
			const body = printExpr(expr[M_AST])
			const symbol = expr[M_ISMACRO] ? 'macro' : '=>'
			return `(${symbol} ${params} ${body})`
		} else {
			return '<JS Function>'
		}
	} else if (isAtom(expr)) {
		return `(atom ${printExpr(expr.value)})`
	} else {
		return '<undefined>'
	}
}
