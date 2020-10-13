import isNodeJS from 'is-node'
import {MalVal, MalError, MalBoolean, MalString, MalNil} from './types'
import {printer} from './printer'
import readStr, {jsToMal} from './reader'

// String functions
export const slurp = (() => {
	if (isNodeJS) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs')
		return (url: string) => {
			return fs.readFileSync(url, 'UTF-8')
		}
	} else {
		return (url: string) => {
			const req = new XMLHttpRequest()
			req.open('GET', url, false)
			req.send()
			if (req.status !== 200) {
				throw new MalError(`Failed to slurp file: ${url}`)
			}
			return req.responseText
		}
	}
})()

const Exports = [
	[
		'throw',
		(msg: MalString) => {
			throw new MalError(msg.value)
		},
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print()))
			return MalNil.create()
		},
	],
	[
		'print-str',
		(...a: MalVal[]) => {
			return MalString.create(a.map(e => e.print()).join(' '))
		},
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => e.print(false)))
			return MalNil.create()
		},
	],
	[
		'clear',
		() => {
			printer.clear()
			return MalNil.create()
		},
	],

	// I/O
	['read-string', (x: MalString) => readStr(x.value)],
	['slurp', (x: MalString) => MalString.create(slurp(x.value))],

	// Interop
	['js-eval', (x: MalString) => jsToMal(eval(x.value.toString()))],

	['*is-node*', MalBoolean.create(isNodeJS)],
	['*host-language*', MalString.create('JavaScript')],
] as [string, MalVal][]

export default Exports
