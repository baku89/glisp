import chalk from 'chalk'
import * as os from 'os'
import * as repl from 'repl'

import {Log} from '../exp'
import * as Exp from '../exp'
import {parse} from '../parser'
import {MathScope} from '../std/math'
import {PreludeScope} from '../std/prelude'

const IO = Exp.tyPrim('IO', () => {
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

const replScope = PreludeScope.extend(MathScope.vars).extend({
	IO: IO,
	def: Exp.fn(
		{name: Exp.tyStr, value: Exp.all},
		IO,
		(name: Exp.Str, value: Exp.Value) => {
			return Exp.withLog(
				IO.of(() => {
					replScope.vars[name.value] = value
				})
			)
		}
	),
	exit: IO.of(process.exit),
})

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			try {
				const exp = parse(input, replScope)
				const evaluated = exp.eval()

				if (IO.isInstance(evaluated.result)) {
					evaluated.result.value()
				}

				cb(null, evaluated)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = Exp.withLog(Exp.unit, {level: 'error', reason: err.message})
				cb(null, r)
			}
		},
		writer: ({result, log}: Exp.WithLog) => {
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
