import readlineSync from 'readline-sync'
import chalk from 'chalk'
import Scope from './mal/scope'
import {jsToMal} from './mal/reader'

const replScope = new Scope()

if (typeof process !== 'undefined' && 2 < process.argv.length) {
	const filename = process.argv[2]

	replScope.def('*ARGV*', jsToMal(process.argv.slice(3)))
	replScope.def('*filename*', jsToMal(filename))
	replScope.REP(`(import "${filename}")`)
	process.exit(0)
}

replScope.REP(`(str "Glisp [" *host-language* "]")`)

readlineSync.setDefaultOptions({
	prompt: {
		// Simple Object that has toString method.
		toString() {
			return chalk.green('glisp> ')
		},
	},
})

readlineSync.promptLoop(line => {
	try {
		replScope.REP(line)
	} catch (e) {
		console.error('Error:', e)
	}

	return false
})
