import readlineSync from 'readline-sync'
import chalk from 'chalk'
import Scope from './mal/scope'
import {readJS} from './mal/reader'

async function main() {
	const replScope = await Scope.createRepl()

	if (typeof process !== 'undefined' && 2 < process.argv.length) {
		const filename = process.argv[2]

		replScope.def('*ARGV*', readJS(process.argv.slice(3)))
		replScope.def('*filename*', readJS(filename))
		await replScope.REP(`(import "${filename}")`)
		process.exit(0)
	}

	await replScope.REP(`(str "Glisp [" *host-language* "]")`)

	readlineSync.setDefaultOptions({
		prompt: {
			// Simple Object that has toString method.
			toString() {
				return chalk.green('glisp> ')
			},
		},
	})

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const line = readlineSync.prompt()
		if (line === null) {
			break
		}
		if (line.trim() === '') {
			continue
		}

		try {
			await replScope.REP(line)
		} catch (e) {
			console.error('Error:', e)
		}
	}
}

main()
