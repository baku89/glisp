import { buildPrelude, parse, print } from '@glisp/lang'
import { describe, expect, it, vi } from 'vitest'

import { useGlispDocument } from './document'
import { commandsAt } from './multiInputs'
import {
	canExtractAt,
	extractedAt,
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
		expect(labels('{a = 1 b = 2}', two)).toEqual(['Merge', 'Extract Parameter'])
		expect(labels('{a = 1 b = 1}', two)).toEqual(['Extract Parameter'])
	})

	it('are nothing for values of different kinds, or that are not simple', () => {
		expect(labels('{a = 1 b = "x"}', two)).toEqual([])
		expect(labels('{a = [1] b = [2]}', two)).toEqual([])
		expect(labels('{a = 1 b = 2}', [at('binding:a')])).toEqual([])
	})

	it('have numbers merge by more than which of them', () => {
		const document = useGlispDocument('{a = 1 b = 3}')
		const [merge] = commandsAt(document, two)
		expect(merge!.children!.map(c => c.label)).toEqual(['First', 'Last', 'Average', 'Min', 'Max'])
		merge!.children!.find(c => c.label === 'Average')!.perform()
		expect(print(document.root.value)).toBe('{a = 2 b = 2}')
	})

	it('have strings merge only as one of them', () => {
		const document = useGlispDocument('{a = "x" b = "y"}')
		const [merge] = commandsAt(document, two)
		expect(merge!.children!.map(c => c.label)).toEqual(['First', 'Last'])
		merge!.children![1]!.perform()
		expect(print(document.root.value)).toBe('{a = "y" b = "y"}')
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
