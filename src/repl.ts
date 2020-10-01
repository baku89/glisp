import readlineSync from 'readline-sync'
import Scope from './mal/scope'
import {MalString} from './mal/types'
import {jsToMal} from './mal/utils'

const replScope = new Scope()

if (typeof process !== 'undefined' && 2 < process.argv.length) {
	const filename = process.argv[2]

	replScope.def('*ARGV*', jsToMal(process.argv.slice(3).map))
	replScope.def('*filename*', MalString.create(filename))
	replScope.REP(`(import "${filename}")`)
	process.exit(0)
}

replScope.REP(`(str "Glisp [" *host-language* "]")`)

while (true) {
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
