import * as os from 'os'
import * as repl from 'repl'

import {ValueWithLog} from '../exp'
import {parse} from '../parser'

function startRepl() {
	repl.start({
		prompt: '>> ',
		eval(input, context, file, cb) {
			const exp = parse(input)
			const result = exp.eval()
			cb(null, result)
		},
		writer: ({result, log}: ValueWithLog) => {
			let str = ''

			if (log.length > 0) {
				str += log.map(l => `[${l.level}] ${l.reason}\n`).join('')
			}

			str += result.print()

			return str
		},
	})
}

function main() {
	console.log(`Hello ${os.userInfo().username}! This is the Glisp REPL!`)
	startRepl()
}

main()
