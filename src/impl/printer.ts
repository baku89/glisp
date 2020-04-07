import {
	MalVal,
	isList,
	isVector,
	MalList,
	MalAtom,
	isMalFunc,
	MalFunc
} from './types'

export const printer = {
	println: (...args: any) => {
		console.log(...args)
	}
}

export default function printExp(obj: MalVal, printReadably = true): string {
	const _r = printReadably

	if (isList(obj)) {
		return '(' + (obj as MalList).map(e => printExp(e, _r)).join(' ') + ')'
	} else if (isVector(obj)) {
		return '[' + (obj as MalList).map(e => printExp(e, _r)).join(' ') + ']'
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
		return `(fn* ${params} ${body})`
	} else if (obj === undefined) {
		return 'UNDEFINED'
	} else {
		return obj?.toString() || 'ERROR'
	}
}
