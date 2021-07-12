import {evalExp, isInstanceOf, readStr} from './glisp'

function testInstanceOf(aStr: string, bStr: string, toBe: boolean) {
	const a = evalExp(readStr(aStr)).result
	const b = evalExp(readStr(bStr)).result

	const ret = isInstanceOf(a, b)
	const succeed = ret === toBe
	const fn = succeed ? console.log : console.error

	const msg = `${aStr} :< ${bStr} | Expected: ${toBe} | Got: ${ret}`

	if (!succeed) {
		alert(msg)
		fn(msg)
	}
}

export default function runTest() {
	testInstanceOf('Number', '*', true)
	testInstanceOf('true', 'Boolean', true)
	testInstanceOf('*', 'Number', false)
	testInstanceOf('Number', 'Number', false)
	testInstanceOf('Number', 'String', false)
	testInstanceOf('[3 false]', '[Number]', true)
	testInstanceOf('[Number Number]', '[]', true)
	testInstanceOf('[Number Number]', '*', true)
	testInstanceOf('(+ 1 2)', 'Number', true)
	testInstanceOf('+', '(typeof +)', true)

	// Vector
	testInstanceOf('[0 1 2]', '[...Number]', true)
	testInstanceOf('[...0]', '[...Number]', true)
	testInstanceOf('[0 ...0]', '[...Number]', true)
	testInstanceOf('[0 1 ...2]', '[0 ...Number]', true)
	testInstanceOf('[...0]', '[Number]', false)
	testInstanceOf('[...0]', '[...0]', true)
	testInstanceOf('[0]', '[Number Number]', false)
}
