import * as Exp from '../exp'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'

export function parse(
	input: string | Exp.Exp,
	parent: Exp.ExpComplex = PreludeScope
): Exp.Exp {
	let exp: Exp.Exp
	if (typeof input === 'string') {
		exp = Parser.parse(input, parent)
	} else {
		exp = input
		Exp.setParent(exp, parent)
	}
	return exp
}

export function evaluate(input: string | Exp.Exp): Exp.Value {
	return parse(input).eval().result
}

export function testEval(
	input: Exp.Exp | string,
	expected: Exp.Value | string,
	hasLog = false
) {
	const iStr = typeof input === 'string' ? input : input.print()
	const eStr =
		typeof expected === 'string' ? expected : expected.toAst().print()

	test(`${iStr} evaluates to ${eStr}`, () => {
		const exp = parse(input)
		const expectedVal = parse(input).eval().result

		const {result, log} = exp.eval()
		if (!result.isEqualTo(expectedVal)) {
			throw new Error('Got=' + result.toAst().print())
		}
		if (!hasLog && log.length > 0) {
			throw new Error('Expected no log, but got=' + printLog(log))
		}
	})
}

export function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
