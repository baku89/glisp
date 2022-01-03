import chalk from 'chalk'
import * as os from 'os'
import * as repl from 'repl'

import * as Ast from '../ast'
import {GlispError} from '../GlispError'
import {Log, WithLog, withLog} from '../log'
import {parse} from '../parser'
import {MathScope} from '../std/math'
import {PreludeScope} from '../std/prelude'
import * as Val from '../val'

const IO = Val.tyPrim('IO', () => {
	return
})

const defaultExp = Ast.lUnit()

function printLog({level, reason, ref}: Log) {
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

	const content = header + ' ' + reason
	const loc = ref !== defaultExp ? chalk.gray('\n    at ' + ref.print()) : ''

	return content + loc
}

const replScope = PreludeScope.extend(MathScope.vars).extend({
	IO: Ast.obj(IO),
	def: Ast.obj(
		Val.fn(
			{name: Val.tyStr, value: Val.all},
			IO,
			(name: Val.Str, value: Val.Value) => {
				return withLog(
					IO.of(() => {
						replScope.vars[name.value] = Ast.obj(value)
					})
				)
			}
		)
	),
	exit: Ast.obj(IO.of(process.exit)),
})

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			let exp: Ast.Node = defaultExp

			// Parse
			try {
				exp = parse(input, replScope)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = withLog(Val.unit, {
					level: 'error',
					reason: err.message,
					ref: exp,
				})
				cb(null, r)
			}

			// Eval
			try {
				const evaluated = exp.eval()

				if (IO.isInstance(evaluated.result)) {
					evaluated.result.value()
				}

				cb(null, evaluated)
			} catch (err) {
				const r = withLog(Val.unit, {
					level: 'error',
					reason: err instanceof Error ? err.message : 'Run-time error',
					ref: err instanceof GlispError ? err.ref : exp,
				})
				cb(null, r)
			}
		},
		writer: ({result, log}: WithLog) => {
			let str = ''

			for (const l of log) {
				str += printLog(l) + '\n'
			}

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
