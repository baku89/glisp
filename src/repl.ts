import readlineSync from 'readline-sync'
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

// replScope.REP(`(str "Glisp [" *host-language* "]")`)

for (;;) {
	const line = readlineSync.question('glisp> ')
	if (line == null) {
		break
	}
	if (line === '') {
		continue
	}
	try {
		replScope.REP(line)
	} catch (e) {
		console.error('Error:', e)
	}
}
