import * as Exp from '../exp'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'

export function parse(input: string | Exp.Node): Exp.Node {
	let exp: Exp.Node
	if (typeof input === 'string') {
		exp = Parser.parse(input)
	} else {
		exp = input
	}
	exp.parent = PreludeScope
	return exp
}

export function evaluate(input: string | Exp.Node): Exp.Value {
	return parse(input).eval2().result
}

export function testEval(
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

export function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
