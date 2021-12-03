import chalk from 'chalk'
import * as os from 'os'
import * as repl from 'repl'

import {Log, obj, ValueWithLog} from '../exp'
import {parse} from '../parser'
import {GlobalScope} from '../std/global'
import MathScope from '../std/math'
import {Writer} from '../utils/Writer'
import * as Val from '../val'

const tyIO = Val.tyAtom('IO', () => {
	return
})

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

const replScope = GlobalScope.extend(MathScope.vars).extend({
	IO: obj(tyIO),
	def: obj(
		Val.fn(
			(name: Val.Str, value: Val.Value) => {
				return Writer.of(
					tyIO.of(() => {
						replScope.vars[name.value] = obj(value)
					})
				)
			},
			{name: Val.tyStr, value: Val.all},
			tyIO
		)
	),
	exit: obj(tyIO.of(process.exit)),
})

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			try {
				const exp = parse(input)
				exp.parent = replScope
				const evaluated = exp.eval()

				if (tyIO.isInstance(evaluated.result)) {
					evaluated.result.value()
				}

				cb(null, evaluated)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = Writer.of(Val.unit, {level: 'error', reason: err.message})
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
