import {evalExp, isInstanceOf, readStr} from './glisp'

function testIsa(aStr: string, bStr: string, toBe: boolean) {
	const a = evalExp(readStr(aStr)).result
	const b = evalExp(readStr(bStr)).result

	const ret = isInstanceOf(a, b, false)

	const fn = ret === toBe ? console.log : console.error

	fn(`${aStr} :< ${bStr} | Expected: ${toBe} | Got: ${ret}`)
}

testIsa('Number', 'Any', true)
testIsa('true', 'Boolean', true)
testIsa('Any', 'Number', false)
testIsa('Number', 'Number', false)
testIsa('Number', 'String', false)
testIsa('[3 false]', '[Number]', true)
testIsa('[Number Number]', '[]', true)
testIsa('[Number Number]', 'Any', true)
testIsa('(+ 1 2)', 'Number', true)
