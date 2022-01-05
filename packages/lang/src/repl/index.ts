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

const IO = Val.primType('IO', () => {
	return
})

const defaultNode = Ast.call()

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
	const loc = ref !== defaultNode ? chalk.gray('\n    at ' + ref.print()) : ''

	return content + loc
}

const replScope = PreludeScope.extend(MathScope.vars).extend({
	IO: Ast.value(IO),
	def: Ast.value(
		Val.fn(
			{name: Val.StrType, value: Val.all},
			IO,
			(name: Ast.Arg<Val.Str>, value: Ast.Arg<Val.Value>) => {
				return withLog(
					IO.of(() => {
						replScope.vars[name().value] = Ast.value(value())
					})
				)
			}
		)
	),
	exit: Ast.value(IO.of(process.exit)),
})

function startRepl() {
	repl.start({
		prompt: chalk.bold.gray('> '),
		eval(input, context, file, cb) {
			let node: Ast.Node = defaultNode

			// Parse
			try {
				node = parse(input, replScope)
			} catch (err) {
				if (!(err instanceof Error)) throw err
				const r = withLog(Val.unit, {
					level: 'error',
					reason: err.message,
					ref: node,
				})
				cb(null, r)
			}

			// Eval
			try {
				const evaluated = node.eval()

				if (IO.isInstance(evaluated.result)) {
					evaluated.result.value()
				}

				cb(null, evaluated)
			} catch (err) {
				const r = withLog(Val.unit, {
					level: 'error',
					reason: err instanceof Error ? err.message : 'Run-time error',
					ref: err instanceof GlispError ? err.ref : node,
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
