import {vsprintf} from 'sprintf-js'
import isNode from 'is-node'

import {MalVal, LispError} from './types'
import printExp, {printer} from './printer'
import readStr from './reader'
import interop from './interop'

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
			const hashedUrl =
				url + (/\?/.test(url) ? '&' : '?') + new Date().getTime()
			req.open('GET', hashedUrl, false)
			req.send()
			if (req.status !== 200) {
				throw new LispError(`Failed to slurp file: ${url}`)
			}
			console.log(url, req.responseText)
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
		}
	],

	// Standard Output
	[
		'prn',
		(...a: MalVal[]) => {
			printer.log(...a.map(e => printExp(e, true)))
			return null
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
