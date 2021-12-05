import * as Exp from '../exp'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'

describe('evaluating literals', () => {
	testEval(Exp.all(), Exp.all())
	testEval(Exp.bottom(), Exp.bottom())
	testEval(Exp.unit(), Exp.unit())
	testEval(Exp.num(0), Exp.num(0))
	testEval(Exp.str('foo'), Exp.str('foo'))
	testEval(Exp.sym('true2'), Exp.True)
	testEval(Exp.sym('false2'), Exp.False)
	testEval(Exp.eVec(Exp.num(0)), Exp.vec(Exp.num(0)))
	testEval(Exp.vec(Exp.num(0)), Exp.vec(Exp.num(0)))
	testEval('{a:1 b:2}', Exp.dict({a: Exp.num(1), b: Exp.num(2)}))
	testEval(
		'{a?:Num2 ...Str}',
		Exp.tyDict({a: {optional: true, value: Exp.tyNum}}, Exp.tyStr)
	)
	testEval('(-> Num2 Num2)', Exp.tyFn(Exp.tyNum, Exp.tyNum))
})

function parse(input: string | Exp.Node): Exp.Node {
	let exp: Exp.Node
	if (typeof input === 'string') {
		exp = Parser.parse(input)
	} else {
		exp = input
	}
	exp.parent = PreludeScope
	return exp
}

function testEval(
	input: Exp.Node | string,
	expected: Exp.Value,
	hasLog = false
) {
	const exp = parse(input)

	test(`${exp.print()} evaluates to ${expected.print()}`, () => {
		const {result, log} = exp.eval2()
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
