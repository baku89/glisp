import * as Ast from '../ast'
import {Log} from '../log'
import * as Parser from '../parser'
import {PreludeScope} from '../std/prelude'
import * as Val from '../val'

export function parse(
	input: string | Ast.Node,
	parent: Ast.InnerNode = PreludeScope
): Ast.Node {
	let ast: Ast.Node
	if (typeof input === 'string') {
		ast = Parser.parse(input, parent)
	} else {
		ast = input
		Ast.setParent(ast, parent)
	}
	return ast
}

export function evaluate(input: string | Ast.Node): Val.Value {
	return parse(input).eval().result
}

export function testEval(
	input: Ast.Node | string,
	expected: Val.Value | string,
	hasLog = false
) {
	const iStr = typeof input === 'string' ? input : input.print()
	const eStr = typeof expected === 'string' ? expected : expected.print()

	test(`${iStr} evaluates to ${eStr}`, () => {
		const exp = parse(input)
		const expectedVal = parse(input).eval().result

		const {result, log} = exp.eval()
		if (!result.isEqualTo(expectedVal)) {
			throw new Error('Got=' + result.print())
		}
		if (!hasLog && log.size > 0) {
			throw new Error('Expected no log, but got=' + printLog(log))
		}
	})
}

export function printLog(log: Set<Log>) {
	return [...log].map(l => `[${l.level}] ${l.reason}\n`).join('')
}
