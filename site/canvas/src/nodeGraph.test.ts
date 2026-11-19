import { buildPrelude, type Env, evaluate, LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import {
	blockAt,
	connected,
	disconnected,
	graphOf,
	HEADER_HEIGHT,
	heightOf,
	inputPort,
	NODE_WIDTH,
	outputPort,
	placeOf,
	ROW_HEIGHT,
	withBlockAround,
	withBlockAt,
	withNode,
	withNodesAt,
	withoutNodes,
	withResult,
} from './nodeGraph'

const env: Env = withGraphics(buildPrelude())
const block = (source: string): LetAST => parse(source) as LetAST
const node = (source: string, key: string) => graphOf(block(source), env).nodes.find(other => other.key === key)!

describe('a let-block as a graph', () => {
	it('has a node for each of what it binds, wired by what refers to what', () => {
		const { nodes, edges } = graphOf(block('{a = (+ b 1) b = 20}'), env)
		expect(nodes.map(({ key, name }) => [key, name])).toEqual([
			['binding:a', 'a'],
			['binding:b', 'b'],
		])
		expect(edges).toEqual([{ from: 'binding:b', to: 'binding:a', input: nodes[0]!.inputs[0]!.key }])
	})

	it('ends at what the block comes to, which is its last', () => {
		const { nodes } = graphOf(block('{a = (+ b 1) b = 20}'), env)
		expect(nodes.filter(({ result }) => result).map(({ name }) => name)).toEqual(['b'])
		const ended = graphOf(block('{a = 1 (+ a 2)}'), env)
		expect(ended.nodes.at(-1)).toMatchObject({ key: 'body', name: null, result: true })
		expect(ended.edges.map(({ from, to }) => [from, to])).toEqual([['binding:a', 'body']])
	})

	it('says what a node calls, and what goes into it, as written or as the node it is', () => {
		const a = node('{a = (+ b 1) b = 20}', 'binding:a')
		expect(a.fn).toBe('+')
		expect(a.inputs.map(({ from, text }) => [from, text])).toEqual([
			['binding:b', null],
			[null, '1'],
		])
		expect(node('{a = (+ b 1) b = 20}', 'binding:b')).toMatchObject({ inputs: [], text: '20' })
	})

	it('wires what is referred to further in to the input that it is in', () => {
		const { edges, nodes } = graphOf(block('{a = (+ (* b 2) 1) b = 20}'), env)
		expect(edges).toEqual([{ from: 'binding:b', to: 'binding:a', input: nodes[0]!.inputs[0]!.key }])
		expect(nodes[0]!.inputs[0]).toMatchObject({ from: null, text: '(* b 2)' })
	})

	it('wires a node that is only another to it as a whole', () => {
		expect(graphOf(block('{a = b b = 20}'), env).edges).toEqual([{ from: 'binding:b', to: 'binding:a', input: null }])
	})

	it('does not go on forever where nodes refer to each other', () => {
		expect(graphOf(block('{a = (+ b 1) b = (+ a 1)}'), env).nodes).toHaveLength(2)
	})
})

describe('where a node is', () => {
	it('is what its metadata says', () => {
		expect(node('{a = ^{at: [120 40]} (+ b 1) b = 20}', 'binding:a')).toMatchObject({ at: [120, 40], placed: true })
		expect(placeOf(parse('^{label: "A"} 1'))).toBeNull()
	})

	it('is otherwise after what it is made from, with those of a column one under another', () => {
		const { nodes } = graphOf(block('{c = (+ a b) a = 1 b = 2}'), env)
		const [c, a, b] = nodes
		expect(a!.at).toEqual([0, 0])
		expect(b!.at[0]).toBe(0)
		expect(b!.at[1]).toBeGreaterThanOrEqual(heightOf(a!, true))
		expect(c!.at[0]).toBeGreaterThan(NODE_WIDTH)
		expect(c!.placed).toBe(false)
	})

	it('is written as metadata that says nothing to the value, and keeps what else is said', () => {
		const moved = withNodesAt(block('{a = ^{label: "A"} (+ b 1) b = 20}'), new Map([['binding:a', [10.4, 20.6]], ['binding:b', [0, 0]]]))
		expect(print(moved)).toBe('{a = ^{label: "A" at: [10 21]} (+ b 1) b = ^{at: [0 0]} 20}')
		expect(evaluate(moved, env).value).toBe(20)
		const again = withNodesAt(moved, new Map([['binding:a', [5, 5]]]))
		expect(print(again)).toContain('a = ^{label: "A" at: [5 5]} (+ b 1)')
	})

	it('has its wires come in at each input when near, and at its top when far', () => {
		const a = node('{a = ^{at: [100 50]} (+ b 1) b = 20}', 'binding:a')
		const second = a.inputs[1]!.key
		expect(inputPort(a, second, true)).toEqual([100, 50 + HEADER_HEIGHT + ROW_HEIGHT * 1.5])
		expect(inputPort(a, second, false)).toEqual([100, 50 + HEADER_HEIGHT / 2])
		expect(outputPort(a)).toEqual([100 + NODE_WIDTH, 50 + HEADER_HEIGHT / 2])
		expect(heightOf(a, false)).toBe(HEADER_HEIGHT)
		expect(heightOf(a, true)).toBeGreaterThan(HEADER_HEIGHT + ROW_HEIGHT * 2)
	})
})

describe('editing a graph', () => {
	it('wires a node into an input by referring to it', () => {
		const from = block('{a = (+ 2 1) b = 20}')
		const input = graphOf(from, env).nodes[0]!.inputs[0]!.key
		expect(print(connected(from, env, 'binding:b', 'binding:a', input)!)).toBe('{a = (+ b 1) b = 20}')
	})

	it('wires into a node as a whole, keeping where it is', () => {
		const next = connected(block('{a = ^{at: [1 2]} 5 b = 20}'), env, 'binding:b', 'binding:a', null)
		expect(print(next!)).toBe('{a = ^{at: [1 2]} b b = 20}')
	})

	it('does not wire a node into what it is made from, or into itself', () => {
		const from = block('{a = (+ b 1) b = (+ 1 2)}')
		const input = graphOf(from, env).nodes[1]!.inputs[0]!.key
		expect(connected(from, env, 'binding:a', 'binding:b', input)).toBeNull()
		expect(connected(from, env, 'binding:a', 'binding:a', input)).toBeNull()
	})

	it('takes a wire off, leaving what it came to', () => {
		const from = block('{a = (+ b 1) b = 20}')
		const input = graphOf(from, env).nodes[0]!.inputs[0]!.key
		expect(print(disconnected(from, env, 'binding:a', input)!)).toBe('{a = (+ 20 1) b = 20}')
	})

	it('has the block come to another node by putting that last', () => {
		expect(print(withResult(block('{a = (+ b 1) b = 20}'), 'binding:a', 'result1'))).toBe('{b = 20 a = (+ b 1)}')
		expect(print(withResult(block('{a = 1 (+ a 2)}'), 'binding:a', 'result1'))).toBe('{result1 = (+ a 2) a = 1}')
	})

	it('adds a node without changing what the block comes to', () => {
		const next = withNode(block('{a = (+ b 1) b = 20}'), 'c', parse('3'), [40, 80])
		expect(print(next)).toBe('{a = (+ b 1) c = ^{at: [40 80]} 3 b = 20}')
		expect(print(withNode(block('{a = 1 (+ a 2)}'), 'c', parse('3'), [0, 0]))).toBe('{a = 1 c = ^{at: [0 0]} 3 (+ a 2)}')
	})

	it('takes nodes away, but not what the block comes to', () => {
		expect(print(withoutNodes(block('{a = 1 b = 2 c = 3}'), env, ['binding:a', 'binding:c']))).toBe('{b = 2 c = 3}')
	})

	it('leaves what a node taken away was wired into as it is, with what came into it', () => {
		expect(print(withoutNodes(block('{b = 20 v = 5 a = (+ b v)}'), env, ['binding:v']))).toBe('{b = 20 a = (+ b 5)}')
		expect(print(withoutNodes(block('{v = [1 2] a = (+ 3 v)}'), env, ['binding:v']))).toBe('{a = (+ 3 [1 2])}')
	})
})

describe('a block in a program', () => {
	const root = parse('{r = (+ 1 {x = 2 y = (* x 3)})}')
	const inputs = graphOf(root as LetAST, env).nodes[0]!.inputs
	const path = `binding:r/${inputs[1]!.key}`

	it('is found by its path, and put back there', () => {
		const found = blockAt(root, env, path)!
		expect(print(found.block)).toBe('{x = 2 y = (* x 3)}')
		const next = withBlockAt(root, env, path, withNodesAt(found.block, new Map([['binding:x', [3, 4]]])))
		expect(print(next!)).toBe('{r = (+ 1 {x = ^{at: [3 4]} 2 y = (* x 3)})}')
		expect(blockAt(root, env, 'binding:r')).toBeNull()
		expect(blockAt(root, env, '')!.block).toBe(root)
	})

	it('is put around what is at a path, which it then comes to', () => {
		const next = withBlockAround(root, env, `binding:r/${inputs[0]!.key}`, 'value1')!
		expect(print(next)).toBe('{r = (+ {value1 = 1} {x = 2 y = (* x 3)})}')
		expect(evaluate(next, env).value).toBe(7)
		expect(withBlockAround(root, env, path, 'value1')).toBeNull()
	})
})

describe('what a node is of', () => {
	it('is what it comes to, and for each of what goes into it, what that wants', () => {
		const a = node('{a = (+ b 1) b = 20 c = "x"}', 'binding:a')
		expect(a.type?.typeName).toBe('number')
		expect(a.inputs.map(input => input.type?.typeName)).toEqual(['number', 'number'])
		expect(node('{a = (+ b 1) b = 20 c = "x"}', 'binding:c').type?.typeName).toBe('string')
	})

	it('is what is there, for an input that nothing says what it wants', () => {
		const made = node('{a = [1 "x"] b = 20}', 'binding:a')
		expect(made.inputs.map(input => input.type?.typeName)).toEqual(['number', 'string'])
	})
})
