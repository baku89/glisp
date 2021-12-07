import * as Exp from '../exp'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'

export function parse(
	input: string | Exp.Node,
	parent: Exp.ExpComplex = PreludeScope
): Exp.Node {
	let exp: Exp.Node
	if (typeof input === 'string') {
		exp = Parser.parse(input, parent)
	} else {
		exp = input
		Exp.setParent(exp, parent)
	}
	return exp
}

export function evaluate(input: string | Exp.Node): Exp.Value {
	return parse(input).eval2().result
}

export function testEval(
	input: Exp.Node | string,
	expected: Exp.Value | string,
	hasLog = false
) {
	const iStr = typeof input === 'string' ? input : input.print()
	const eStr = typeof expected === 'string' ? expected : expected.print()

	test(`${iStr} evaluates to ${eStr}`, () => {
		const exp = parse(input)
		const expectedVal = parse(input).eval2().result

		const {result, log} = exp.eval2()
		if (!result.isEqualTo(expectedVal)) {
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
