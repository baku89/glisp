import {parse} from '../parser'
import {PreludeScope} from '../std/prelude'

describe('default values of types', () => {
	run('1', '1')
	run('Num', '0')
	run('Bool', 'false')
	run('(| 3 4)', '3')
	run('(| Num Bool)', '0')
	run('(| Bool Num)', 'false')
	run('()', '()')
	run('_', '()')
	run('<T>', '()')
	run('(-> () Num)', '0', true)
	run('(-> Num Num)', '0', true)
	run('(-> (Num Num) Num)', '0', true)
	run('(-> Num Bool)', 'false', true)
	run('(-> <T> <T>)', '()', true)
	run('(-> _ ())', '()', true)

	function run(input: string, expected: string, fn = false) {
		const eStr = fn ? `(=> () ${expected})` : expected
		it(`default value of '${input}' is '${eStr}'`, () => {
			let dv = parseEval(input).defaultValue
			const expectedVal = parseEval(expected)

			if (fn) {
				if (dv.type !== 'fn') throw new Error('Got=' + dv.print())
				dv = dv.fn().result
			}

			if (!dv.isEqualTo(expectedVal)) {
				throw new Error('Got=' + dv.print())
			}
		})
	}
})

function parseEval(input: string) {
	const exp = parse(input)
	exp.parent = PreludeScope

	return exp.eval().result
}
