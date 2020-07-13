import {
	MalVal,
	MalAtom,
	M_PARAMS,
	M_AST,
	M_ELMSTRS,
	M_DELIMITERS,
	getType,
	MalFunc,
	MalNode,
	MalSymbol,
	MalType,
	isSeq,
	symbolFor as S,
	MalSeq,
	M_ISSUGAR
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
	pseudoExecute: (command: string) => {
		console.log(command)
	},
	clear: console.clear
}

function generateDefaultDelimiters(elementCount: number) {
	if (elementCount === 0) {
		return ['']
	} else {
		return ['', ...Array(elementCount - 1).fill(' '), '']
	}
}

const SUGAR_INFO = new Map<MalVal, {prefix: string}>([
	[S('quote'), {prefix: "'"}],
	[S('ui-annotate'), {prefix: '#@'}],
	[S('with-meta-sugar'), {prefix: '^'}]
])

export default function printExp(exp: MalVal, printReadably = true): string {
	const _r = printReadably

	const type = getType(exp)

	switch (type) {
		// Collection
		case MalType.List:
		case MalType.Vector:
		case MalType.Map: {
			const coll = exp as MalNode

			const sugarInfo =
				type === MalType.List && SUGAR_INFO.get((coll as MalSeq)[0])

			if (sugarInfo /* && !(M_ISSUGAR in coll)*/) {
				;(coll as MalSeq)[M_ISSUGAR] = true
				coll[M_ELMSTRS] = [
					sugarInfo.prefix,
					...(coll as MalSeq).slice(1).map(e => printExp(e, _r))
				]
				coll[M_DELIMITERS] = Array((coll as MalSeq).length + 1).fill('')
			} else {
				// Creates a cache if there's no element text cache
				if (!(M_ELMSTRS in coll)) {
					let elmStrs: string[]

					if (isSeq(coll)) {
						elmStrs = coll.map(e => printExp(e, _r))
						if (sugarInfo) {
							elmStrs[0] = ''
						}
					} else {
						// NOTE: This might change the order of key
						elmStrs = Object.entries(coll)
							.map(([key, value]) => [printExp(key, _r), printExp(value, _r)])
							.flat()
					}
					coll[M_ELMSTRS] = elmStrs
				}

				// Creates a cache for delimiters if it does not exist
				if (!(M_DELIMITERS in coll)) {
					let delimiters: string[]

					if (isSeq(coll)) {
						delimiters = generateDefaultDelimiters(coll.length)
					} else {
						// Map
						delimiters = generateDefaultDelimiters(Object.keys(coll).length * 2)
					}

					coll[M_DELIMITERS] = delimiters
				}
			}

			// Print using cache
			const elmStrs = coll[M_ELMSTRS]
			const delimiters = coll[M_DELIMITERS]

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
		}
		// Atoms
		case MalType.Number:
			return (exp as number).toString()
		case MalType.String:
			if (_r) {
				return (
					'"' +
					(exp as string)
						.replace(/\\/g, '\\\\')
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n') +
					'"'
				)
			} else {
				return exp as string
			}
		case MalType.Boolean:
			return (exp as boolean).toString()
		case MalType.Nil:
			return 'nil'
		case MalType.Symbol:
			return (exp as MalSymbol).value
		case MalType.Keyword:
			return ':' + (exp as string).slice(1)
		case MalType.Atom:
			return `(atom ${printExp((exp as MalAtom).value, _r)})`
		case MalType.Function:
		case MalType.Macro: {
			if (M_AST in (exp as MalFunc)) {
				const params = printExp((exp as MalFunc)[M_PARAMS], _r)
				const body = printExp((exp as MalFunc)[M_AST], _r)
				return `(${type} ${params} ${body})`
			} else {
				return '<JS Function>'
			}
		}
		default:
			//case MalType.Undefined:
			return '<undefined>'
	}
}
