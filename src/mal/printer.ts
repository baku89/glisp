import {MalError, MalVal} from './types'

const printer = (globalThis as any)['glisp_printer'] || {
	log: console.info,
	return: console.log,
	error: console.error,
	clear: console.clear,
	rep: () => {
		throw new MalError('No console')
	},
}

;(globalThis as any)['glisp_printer'] = printer

export {printer}

export default function printExp(exp: MalVal): string {
	return exp.print()
}
