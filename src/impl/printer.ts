import {MalVal, MalAtom, isMalFunc, MalFunc} from './types'

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

	if (Array.isArray(obj)) {
		if (obj.length === 2) {
			if (obj[0] === Symbol.for('quote')) {
				return "'" + printExp(obj[1], _r)
			} else if (obj[0] === Symbol.for('quasiquote')) {
				return '`' + printExp(obj[1], _r)
			} else if (obj[0] === Symbol.for('unquote')) {
				return '~' + printExp(obj[1], _r)
			} else if (obj[0] === Symbol.for('splice-unquote')) {
				return '~@' + printExp(obj[1], _r)
			}
		}

		return '(' + obj.map(e => printExp(e, _r)).join(' ') + ')'
	} else if (typeof obj === 'string') {
		return _r
			? '"' +
					obj
						.replace(/\\/g, '\\\\')
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n') +
					'"'
			: obj
	} else if (typeof obj === 'symbol') {
		return Symbol.keyFor(obj) || 'INVALID_SYM'
	} else if (obj === null) {
		return 'nil'
	} else if (obj instanceof MalAtom) {
		return '(atom ' + printExp(obj.val, _r) + ')'
	} else if (isMalFunc(obj)) {
		const params = printExp((obj as MalFunc).params, _r)
		const body = printExp((obj as MalFunc).ast, _r)
		return `(fn ${params} ${body})`
	} else if (obj === undefined) {
		return 'UNDEFINED'
	} else {
		return obj?.toString() || 'ERROR'
	}
}
