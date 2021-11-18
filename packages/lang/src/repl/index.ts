import chalk from 'chalk'
import * as os from 'os'
import * as repl from 'repl'

import {Log, obj, scope, ValueWithLog} from '../exp'
import {parse} from '../parser'
import {GlobalScope} from '../std/global'
import {Writer} from '../utils/Writer'
import * as Val from '../val'

function printLog({level, reason}: Log) {
	let header: string
	switch (level) {
		case 'error':
			header = chalk.bold.inverse.red(' ERROR ')
			break
		case 'warn':
			header = chalk.bold.inverse.yellow('  WARN ')
			break
		case 'info':
			header = chalk.bold.inverse.blue('  INFO ')
			break
	}

	return header + ' ' + reason
}

const replScope = scope({
	def: obj(
		Val.fn(
			(name: Val.Str, value: Val.Value) => {
				return Writer.of(
					Val.atom(() => {
						replScope.vars[name.value] = obj(value)
					}, Val.tyIO)
				)
			},
			{name: Val.tyStr, value: Val.all},
			Val.tyIO
		)
	),
})
replScope.parent = GlobalScope

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			try {
				const exp = parse(input)
				exp.parent = replScope
				const evaluated = exp.eval()

				if (Val.tyIO.isInstance(evaluated.result)) {
					evaluated.result.value()
				}

				cb(null, evaluated)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = Writer.of(Val.bottom, {level: 'error', reason: err.message})
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
