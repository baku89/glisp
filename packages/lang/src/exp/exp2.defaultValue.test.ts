import {parse} from '../utils/testUtils2'
import {Value} from '.'

describe('default values of types', () => {
	run('1', '1')
	run('Num2', '0')
	run('Str2', '""')
	run('Bool2', 'false2')
	// run('(| 3 4)', '3')
	// run('(| Num2 Bool2)', '0')
	// run('(| Bool2 Num2)', 'false2')
	run('()', '()')
	run('_', '()')
	run('_|_', '_|_')
	run('<T>', '()')

	run('[]', '[]')
	run('[Num2 Str2]', '[0 ""]')
	run('[...Num2]', '[]')
	run('[Num2 ...Num2]', '[0]')

	run('{}', '{}')
	run('{a:Num2 b:Str2}', '{a:0 b:""}')
	run('{a:Num2 b?:Str2}', '{a:0}')
	run('{...Num2}', '{}')
	run('{a:Num2 ...Str2}', '{a:0}')
	run('{a?:Num2 ...Str2}', '{}')

	run('(-> () Num2)', '0', true)
	run('(-> Num2 Bool2)', 'false2', true)
	run('(-> <T> <T>)', '()', true)
	run('(-> _ ())', '()', true)

	function run(input: string, expected: string, fn = false) {
		const eStr = fn ? `(=> () ${expected})` : expected

		it(`default value of '${input}' is '${eStr}'`, () => {
			let dv: Value = parse(input).eval2().result.defaultValue
			const ev = parse(expected).eval2().result

			if (fn) {
				if (dv.type !== 'fn') throw new Error('Got=' + dv.print())
				dv = dv.fn().result
			}

			if (!dv.isEqualTo(ev)) {
				throw new Error('Got=' + dv.print())
			}
		})
	}
})
