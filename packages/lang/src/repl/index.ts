import chalk from 'chalk'
import * as os from 'os'
import * as repl from 'repl'

import {Log, ValueWithLog} from '../exp'
import {parse} from '../parser'
import {Writer} from '../utils/Writer'
import {bottom} from '../val'

function printLog({level, reason}: Log) {
	let header: string
	switch (level) {
		case 'error':
			header = chalk.bold.inverse.red(' ERROR ')
			break
		case 'warn':
			header = chalk.bold.inverse.yellow(' WARN  ')
			break
		case 'info':
			header = chalk.bold.inverse.blue(' INFO  ')
			break
	}

	return header + ' ' + reason
}

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			try {
				const exp = parse(input)
				const result = exp.eval()
				cb(null, result)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = Writer.of(bottom, {level: 'error', reason: err.message})
				cb(null, r)
			}
		},
		writer: ({result, log}: ValueWithLog) => {
			let str = ''

			str += log.map(l => printLog(l) + '\n').join('')
			str += chalk.bold.gray('< ') + result.print()

			return str + '\n'
		},
	})
}

function main() {
	console.log(`Hello ${os.userInfo().username}! Welcome to Glisp.`)
	startRepl()
}

main()
