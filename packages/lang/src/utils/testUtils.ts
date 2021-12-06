import * as Exp from '../exp'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'
import * as Val from '../val'

function parse(
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

export function testEval(
	input: string | Exp.Node,
	expected: Val.Value,
	hasLog = false
) {
	const exp = parse(input)
	test(`${exp.print()} evaluates to ${expected.print()}`, () => {
		const {result, log} = exp.eval()
		if (!Val.isEqual(result, expected)) {
			throw new Error('Got=' + result.print() + '\n' + printLog(log))
		}
		if (!hasLog && log.length > 0) {
			throw new Error('Expected no log, but got=' + printLog(log))
		}
	})
}

export function testInfer(input: string | Exp.Node, expected: Val.Value) {
	const exp = parse(input)

	test(`${exp.print()} is inferred to be ${expected.print()}`, () => {
		const inferred = exp.infer()
		const equal = inferred.isEqualTo(expected)
		if (!equal) throw new Error('Got=' + inferred.print())
	})
}

function printLog(log: Exp.Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}\n`).join('')
}
