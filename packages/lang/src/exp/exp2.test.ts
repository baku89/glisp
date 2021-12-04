import * as Exp from '../exp'
import {PreludeScope} from '../std/prelude'

describe('evaluating literals', () => {
	testEval(Exp.num(0), Exp.num(0))
	testEval(Exp.str('foo'), Exp.str('foo'))
	testEval(Exp.str('foo'), Exp.str('foo'))
	testEval(Exp.vec(Exp.num(0)), Exp.vec(Exp.num(0)))
	testEval(Exp.eVec(Exp.num(0)), Exp.vec(Exp.num(0)))
})

function testEval(input: Exp.Node, expected: Exp.Value, hasLog = false) {
	input.parent = PreludeScope

	test(`${input.print()} evaluates to ${expected.print()}`, () => {
		const {result, log} = input.eval2()
		if (!result.isEqualTo(expected)) {
			throw new Error('Got=' + result.print())
		}
		if (!hasLog && log.length > 0) {
			throw new Error('Expected no log, but got=' + printLog(log))
		}
	})
}
function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
