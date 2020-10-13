import {MalVal} from './types'

const printer = (globalThis as any)['glisp_printer'] || {
	log: console.info,
	return: console.log,
	error: console.error,
	clear: console.clear,
}

;(globalThis as any)['glisp_printer'] = printer

export {printer}

export default function printExp(exp: MalVal): string {
	return exp.print()
}
