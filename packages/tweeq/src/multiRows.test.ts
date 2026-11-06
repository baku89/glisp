import { buildPrelude, evaluate, LetAST, parse, PathAST, print } from '@glisp/lang'
import { describe, expect, it, vi } from 'vitest'

import { useGlispDocument } from './document'
import { commandsAt } from './multiInputs'
import {
	canExtractAt,
	extractedAt,
	extractedLiteralAt,
	misfitAt,
	nameFor,
	type Place,
	valuesAt,
	withValuesAt,
} from './multiRows'

const env = buildPrelude()
const at = (path: string, element: number | null = null): Place => ({ path, element })

describe('places', () => {
	const root = parse('{a = 1 b = [2 3] c = {d = 4 d}}')

	it('come to their values, a number in a vector being one of them', () => {
		expect(valuesAt(root, env, [at('binding:a'), at('binding:b', 1)])).toEqual([1, 3])
		expect(valuesAt(root, env, [at('binding:gone')])).toBeNull()
	})

	it('can each come to a value of their own', () => {
		const { ast } = withValuesAt(root, env, [at('binding:a'), at('binding:b', 1)], [7, 8])
		expect(print(ast!)).toBe('{a = 7 b = [2 8] c = {d = 4 d}}')
	})

	it('are pulled out whatever they are in', () => {
		const places = [at('binding:a'), at('binding:b', 0), at('binding:b', 1)]
		const { ast, name } = extractedAt(root, env, places, 5, 'value')!
		expect(name).toBe('value')
		expect(print(ast)).toBe('{value = 5 a = value b = [value value] c = {d = 4 d}}')
	})

	it('are not pulled out where one is inside of another', () => {
		expect(canExtractAt(root, env, [at('binding:b'), at('binding:b', 0)])).toBe(false)
		expect(canExtractAt(root, env, [at('binding:b'), at('binding:b/0')])).toBe(false)
		expect(canExtractAt(root, env, [at('binding:b', 0), at('binding:b', 1)])).toBe(true)
	})

	it('are not pulled out of a vector that is not written as one', () => {
		const computed = parse('{a = 1 b = (map [1 2] (=> (x: number): number x))}')
		expect(canExtractAt(computed, env, [at('binding:a'), at('binding:b', 0)])).toBe(false)
	})

	it('are given a name that means nothing else where any of them is', () => {
		const inner = parse('{a = 1 b = {x = 2 (+ x 3)}}')
		const path = inner.kind === 'let' ? 'binding:b/binding:x' : ''
		const { name, ast } = extractedAt(inner, env, [at('binding:a'), at(path)], 9, 'x')!
		expect(name).toBe('x2')
		expect(print(ast)).toBe('{x2 = 9 a = x2 b = {x = x2 (+ x 3)}}')
	})

	it('are not given the name of something the prelude has', () => {
		const { name } = extractedAt(root, env, [at('binding:a')], 1, 'map')!
		expect(name).toBe('map2')
	})

	it('are called what they share, or else something plain', () => {
		const same = parse('{a = 1 b = 2}')
		expect(nameFor(same, env, [at('binding:a')])).toBe('a')
		expect(nameFor(same, env, [at('binding:a'), at('binding:b')])).toBe('value')
	})

	it('say what does not fit them', () => {
		const typed = parse('{f = (=> (x: number): number x) a = (f 1)}')
		expect(misfitAt(typed, env, [at('binding:a/arg0')], 'no')).toContain('does not fit')
		expect(misfitAt(typed, env, [at('binding:a/arg0')], 2)).toBeNull()
	})
})

describe('commands on what is selected', () => {
	const labels = (source: string, places: Place[]) => {
		const document = useGlispDocument(source)
		return commandsAt(document, places).map(command => command.label)
	}
	const two = [at('binding:a'), at('binding:b')]

	it('merge what differs, and pull out what is the same or differs', () => {
		expect(labels('{a = 1 b = 2}', two)).toEqual(['Swap', 'Merge', 'Extract Parameter'])
		expect(labels('{a = 1 b = 1}', two)).toEqual(['Extract Parameter'])
	})

	it('are nothing for values of different kinds, or for one alone', () => {
		expect(labels('{a = 1 b = "x"}', two)).toEqual([])
		expect(labels('{a = 1 b = 2}', [at('binding:a')])).toEqual([])
	})

	it('swap vectors written out, as a position and a size are both two numbers', () => {
		expect(labels('{a = [1] b = [2]}', two)).toEqual(['Swap'])
		expect(labels('{a = [1 2] b = [1 2]}', two)).toEqual([])
		const document = useGlispDocument('{a = [1 2] b = [3 4]}')
		const [swap] = commandsAt(document, two)
		expect(swap!.perform!()).toBeUndefined()
		expect(print(document.root.value)).toBe('{a = [3 4] b = [1 2]}')
	})

	it('swap two fields of several rows each, row by row, rather than passing along all of their places', () => {
		const document = useGlispDocument('{a = [[1 2] [3 4]] b = [[5 6] [7 8]]}')
		const fields = [
			[at('binding:a/0'), at('binding:b/0')],
			[at('binding:a/1'), at('binding:b/1')],
		]
		const [swap] = commandsAt(document, fields.flat(), fields)
		expect(swap!.label).toBe('Swap')
		swap!.perform!()
		expect(print(document.root.value)).toBe('{a = [[3 4] [1 2]] b = [[7 8] [5 6]]}')
	})

	it('swap and merge numbers of fields of several rows, row by row', () => {
		const fields = [
			[at('binding:a/0', 0), at('binding:b/0', 0)],
			[at('binding:a/1', 0), at('binding:b/1', 0)],
		]
		const swapped = useGlispDocument('{a = [[100 100] [120 80]] b = [[300 100] [60 90]]}')
		commandsAt(swapped, fields.flat(), fields).find(c => c.label === 'Swap')!.perform!()
		expect(print(swapped.root.value)).toBe('{a = [[120 100] [100 80]] b = [[60 100] [300 90]]}')
		const merging = useGlispDocument('{a = [[100 100] [120 80]] b = [[300 100] [60 90]]}')
		const merge = commandsAt(merging, fields.flat(), fields).find(c => c.label === 'Merge')!
		merge.children!.find(c => c.label === 'First')!.perform()
		expect(print(merging.root.value)).toBe('{a = [[100 100] [100 80]] b = [[300 100] [300 90]]}')
	})

	it('swap a vector written out with a name for one', () => {
		const document = useGlispDocument('{p = [1 2] a = p b = [3 4]}')
		const [swap] = commandsAt(document, two)
		expect(swap!.label).toBe('Swap')
		swap!.perform!()
		expect(print(document.root.value)).toBe('{p = [1 2] a = [3 4] b = p}')
	})

	it('say why, and change nothing, for vectors that do not fit where the other goes', () => {
		const source = '{f = (=> (v: [number number]): _ v) a = (f [1 2]) b = [1 2 3]}'
		const document = useGlispDocument(source)
		const places = [at('binding:a/arg0'), at('binding:b')]
		const swap = commandsAt(document, places).find(c => c.label === 'Swap')!
		expect(swap.perform!()).toEqual(expect.any(String))
		expect(print(document.root.value)).toBe(source)
	})

	it('have numbers merge by more than which of them', () => {
		const document = useGlispDocument('{a = 1 b = 3}')
		const merge = commandsAt(document, two).find(c => c.label === 'Merge')
		expect(merge!.children!.map(c => c.label)).toEqual(['First', 'Last', 'Average', 'Min', 'Max'])
		merge!.children!.find(c => c.label === 'Average')!.perform()
		expect(print(document.root.value)).toBe('{a = 2 b = 2}')
	})

	it('have strings merge only as one of them', () => {
		const document = useGlispDocument('{a = "x" b = "y"}')
		const merge = commandsAt(document, two).find(c => c.label === 'Merge')
		expect(merge!.children!.map(c => c.label)).toEqual(['First', 'Last'])
		merge!.children![1]!.perform()
		expect(print(document.root.value)).toBe('{a = "y" b = "y"}')
	})

	describe('of what refers to something', () => {
		const LINES = 'p = [1 2] q = [3 4]'
		const slots = [at('binding:a/0'), at('binding:b/0')]
		const perform = (source: string, label: string, places = slots) => {
			const document = useGlispDocument(source)
			const command = commandsAt(document, places).find(c => c.label === label)!
			return { document, problem: command.perform!() }
		}

		it('rotate more than two, each going on to the next', () => {
			const source = `{${LINES} r = [5 6] a = [p] b = [q] c = [r]}`
			const { document, problem } = perform(source, 'Pass Along', [...slots, at('binding:c/0')])
			expect(problem).toBeUndefined()
			expect(print(document.root.value)).toBe(`{${LINES} r = [5 6] a = [r] b = [p] c = [q]}`)
		})

		it('move a call as well, with what it refers to meaning the same', () => {
			const { document, problem } = perform(`{${LINES} a = [[p 0]] b = [q]}`, 'Swap')
			expect(problem).toBeUndefined()
			expect(print(document.root.value)).toBe(`{${LINES} a = [q] b = [[p 0]]}`)
		})

		it('say why, and change nothing, for a call that means something else from there', () => {
			const source = `{${LINES} a = [[p 0]] b = {p = [5 6] c = [q]}}`
			const { document, problem } = perform(source, 'Swap', [at('binding:a/0'), at('binding:b/binding:c/0')])
			expect(problem).toEqual(expect.any(String))
			expect(print(document.root.value)).toBe(source)
		})

		it('swap two, and merge any number', () => {
			const two = `{${LINES} a = [p] b = [q]}`
			expect(commandsAt(useGlispDocument(two), slots).map(c => c.label)).toEqual(['Swap', 'Merge'])
			const three = `{${LINES} a = [p] b = [q] c = [q]}`
			expect(commandsAt(useGlispDocument(three), [...slots, at('binding:c/0')]).map(c => c.label)).toEqual(['Pass Along', 'Merge'])
		})

		it('are nothing for what already refers to one thing, or is not a reference', () => {
			expect(commandsAt(useGlispDocument(`{${LINES} a = [p] b = [p]}`), slots)).toEqual([])
			expect(commandsAt(useGlispDocument(`{${LINES} a = [p] b = (path.reverse [q])}`), slots)).toEqual([])
		})

		it('leave one that comes to a number to what numbers have', () => {
			const document = useGlispDocument('{w = 1 h = 2 a = w b = h}')
			expect(commandsAt(document, [at('binding:a'), at('binding:b')]).map(c => c.label)).toEqual(['Swap', 'Merge', 'Extract Parameter'])
		})

		it('are nothing for a vector and a number, which are not two of anything', () => {
			expect(commandsAt(useGlispDocument('{p = [1 2] w = 3 a = p b = w}'), [at('binding:a'), at('binding:b')])).toEqual([])
			expect(commandsAt(useGlispDocument('{a = [1 2] b = 3}'), [at('binding:a'), at('binding:b')])).toEqual([])
		})

		it('swap as one thing to undo', () => {
			const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
			const source = `{${LINES} a = [p] b = [q]}`
			const { document } = perform(source, 'Swap')
			expect(print(document.root.value)).toBe(`{${LINES} a = [q] b = [p]}`)
			document.undo()
			expect(print(document.root.value)).toBe(source)
			now.mockRestore()
		})

		it('merge onto the first or the last', () => {
			const document = useGlispDocument(`{${LINES} a = [p] b = [q]}`)
			const merge = commandsAt(document, slots).find(c => c.label === 'Merge')!
			merge.children![1]!.perform()
			expect(print(document.root.value)).toBe(`{${LINES} a = [q] b = [q]}`)
		})

		it('keep what is said of the place itself', () => {
			const { document } = perform(`{${LINES} a = [#_p] b = [q]}`, 'Swap')
			expect(print(document.root.value)).toBe(`{${LINES} a = [#_q] b = [p]}`)
		})

		it('still mean the same when a name means something else from there', () => {
			const source = `{${LINES} a = [p] b = {p = [5 6] c = [q]}}`
			const places = [at('binding:a/0'), at('binding:b/binding:c/0')]
			const { document, problem } = perform(source, 'Swap', places)
			expect(problem).toBeUndefined()
			const { value } = evaluate(document.root.value, env)
			expect(value).toBeDefined()
			const next = print(document.root.value)
			expect(next).toContain('a = [q]')
			expect(next).not.toContain('c = [p]')
		})

		it('say why, and change nothing, for what would go around in a circle', () => {
			const source = '{x = [y] y = [z] z = [w] w = [1 2]}'
			const { document, problem } = perform(source, 'Swap', [at('binding:x/0'), at('binding:z/0')])
			expect(problem).toEqual(expect.any(String))
			expect(print(document.root.value)).toBe(source)
		})

		it('say why, and change nothing, for what does not fit', () => {
			const source = '{f = (=> (v: [number number]): _ v) p = [1 2] c = [1 2 3] a = (f p) b = [c]}'
			const { document, problem } = perform(source, 'Swap', [at('binding:a/arg0'), at('binding:b/0')])
			expect(problem).toEqual(expect.any(String))
			expect(print(document.root.value)).toBe(source)
		})
	})

	it('pull out, as one thing to undo', () => {
		const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
		const document = useGlispDocument('{a = 2 b = 2}')
		const [extract] = commandsAt(document, two)
		extract!.perform!()
		expect(print(document.root.value)).toBe('{value = 2 a = value b = value}')
		document.undo()
		expect(print(document.root.value)).toBe('{a = 2 b = 2}')
		now.mockRestore()
	})
})

describe('a document in a batch', () => {
	it('undoes all of it as one, however long it takes', () => {
		const now = vi.spyOn(performance, 'now')
		const document = useGlispDocument('{a = 1}')
		const set = (source: string) => document.setRoot(parse(source) as never)
		now.mockReturnValue(10_000)
		document.batch(() => {
			set('{a = 2}')
			now.mockReturnValue(20_000)
			set('{a = 3}')
		})
		now.mockReturnValue(30_000)
		set('{a = 4}')
		document.undo()
		expect(print(document.root.value)).toBe('{a = 3}')
		document.undo()
		expect(print(document.root.value)).toBe('{a = 1}')
		expect(document.canUndo.value).toBe(false)
		now.mockRestore()
	})
})

describe('pulling out what is written, on its own', () => {
	const env = buildPrelude()
	const of = (src: string, path: string) => {
		const result = extractedLiteralAt(parse(src), env, path)
		return result === null ? null : print(result.ast)
	}

	it('gives a number a name of its own, which is what is there from then on', () => {
		const next = of('{a = (+ 1 2)}', 'binding:a/arg1')
		expect(next).toMatch(/= 2 a = \(\+ 1 \w+\)/)
	})

	it('goes for a vector of what is written, as a whole', () => {
		expect(of('{a = (first [1 2])}', 'binding:a/arg0')).toMatch(/= \[1 2\] a = \(first \w+\)/)
	})

	it('has nothing to pull out of what is worked out, is locked, or has a name', () => {
		expect(of('{a = (+ (+ 1 1) 2)}', 'binding:a/arg0')).toBeNull()
		expect(of('{a = (+ 1 @2)}', 'binding:a/arg1')).toBeNull()
		expect(of('{a = 1}', 'binding:a')).toBeNull()
	})
})
