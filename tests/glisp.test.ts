import Scope from '@/mal/scope'

describe('Core', () => {
	const repl = new Scope()

	test('adds 1 + 2 to equal 3', () => {
		// expect(1 + 2).toBe(3)

		expect(repl.readEval('(+ 1 2)')?.print()).toBe('3')
	})
})
