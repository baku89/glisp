import {parse} from '../parser'

describe('default values of types', () => {
	run('1', '1')
	run('Int', '0')
	run('Bool', 'false')
	run('(| 3 4)', '3')
	run('(| Int Bool)', '0')
	run('(| Bool Int)', 'false')
	run('()', '()')
	run('_', '()')
	run('<T>', '()')
	run('(-> () Int)', '0', true)
	run('(-> Int Int)', '0', true)
	run('(-> (Int Int) Int)', '0', true)
	run('(-> Int Bool)', 'false', true)
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
	return parse(input).eval().result
}
