import {vsprintf} from 'sprintf-js'
import isNode from 'is-node'

import {MalVal, LispError, symbolFor as S} from './types'
import printExp, {printer} from './printer'
import readStr from './reader'
import interop from './interop'

const S_AMP = S('&')

// String functions
export const slurp = (() => {
	if (isNode) {
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
				throw new LispError(`Failed to slurp file: ${url}`)
			}
			return req.responseText
		}
	}
})()

// Interop
function jsEval(str: string): MalVal {
	return interop.jsToMal(eval(str.toString()))
}

function jsMethodCall(objMethodStr: string, ...args: MalVal[]): MalVal {
	const [obj, f] = interop.resolveJS(objMethodStr)
	const res = f.apply(obj, args)
	return interop.jsToMal(res)
}

const Exports = [
	[
		'throw',
		(msg: string) => {
			throw new LispError(msg)
		},
		{
			doc: 'Throw an error',
			params: [{label: 'Message', type: 'string'}]
		}
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return null
		},
		{
			doc: 'Print the object to the shell',
			params: [S_AMP, {label: 'Objects', type: 'any'}]
		}
	],
	[
		'println',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, false)))
			return null
		}
	],

	// I/O
	['read-string', readStr],
	['slurp', slurp],

	// Interop
	['js-eval', jsEval],
	['.', jsMethodCall],

	// Needed in import-force
	['format', (fmt: string, ...xs: (number | string)[]) => vsprintf(fmt, xs)],

	['*is-node*', isNode],
	['*host-language*', 'JavaScript']
] as [string, MalVal][]

export default Exports
