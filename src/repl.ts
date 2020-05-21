import readlineSync from 'readline-sync'
import Scope from './mal/scope'

const replScope = new Scope()

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
