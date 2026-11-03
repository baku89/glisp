import { buildPrelude, evaluate, host, meta, parse, print, Session } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { iconOf, withTypeIcons } from './icons'
import { actionsOf, capitalCase, defaultFor, hasValue, isExpression, kindIconOf, literalOf, moveBetween, moveBinding, referenceTargetOf, renameBindingAt, parseSource, problemOf, viewOf, withLiteral } from './structure'

const env = withTypeIcons(buildPrelude())
const view = (src: string) => viewOf(parse(src), env)
const labels = (src: string) => view(src).slots.map(s => s.label)

describe('viewOf', () => {
	it('gives a literal a widget for its type', () => {
		expect(view('1').editor).toEqual({ kind: 'number', value: 1 })
		expect(view('"a"').editor).toEqual({ kind: 'string', value: 'a' })
		expect(view('true').editor).toEqual({ kind: 'boolean', value: true })
		expect(view('()').editor).toEqual({ kind: 'unit' })
	})

	it('gives a literal an enum widget where the slot expects one', () => {
		const session = new Session(env)
		session.exec('Join = (enum "round" "butt")')
		session.exec('f = (=> (j: Join): Join j)')
		const call = parse('(f "butt")')
		const slot = viewOf(call, session.env).slots[0]!
		expect(viewOf(slot.ast, slot.env, slot.expected).editor).toEqual({
			kind: 'enum',
			value: 'butt',
			options: ['round', 'butt'],
		})
	})

	it('shows call arguments by parameter name', () => {
		expect(view('(take [1 2] 1)').title).toBe('take')
		expect(labels('(take [1 2] 1)')).toEqual(['Items', 'Count'])
		expect(labels('(take [1 2] n=1)')).toEqual(['Items', 'Count'])
		expect(labels('(+ 1 2 3)')).toEqual(['Values 0', 'Values 1', 'Values 2'])
	})

	it('knows what each parameter wants, unless it is generic', () => {
		const [xs, n] = view('(take [1 2] 1)').slots
		expect(xs!.expected?.typeName).toBe('[...T]')
		expect(n!.expected?.typeName).toBe('number')
		expect(view('(first [1])').slots[0]!.expected?.typeName).toBe('[...T]')
		expect(view('(+ 1)').slots[0]!.expected?.typeName).toBe('number')
	})

	it('offers a parameter that was not passed', () => {
		const { missing } = view('(take [1 2])')
		expect(missing.map(m => m.name)).toEqual(['Count'])
		expect(print(missing[0]!.add())).toBe('(take [1 2] n=0)')
		expect(view('(take [1 2] n=1)').missing).toEqual([])
	})

	it('shows vectors, records and let-blocks by their children', () => {
		expect(labels('[1 2]')).toEqual(['0', '1'])
		expect(labels('{x: 1 y: 2}')).toEqual(['x', 'y'])
		expect(labels('{a = 1 b = 2 (+ a b)}')).toEqual(['a', 'b', '='])
	})

	it('sees through metadata', () => {
		const v = view('^{label: "Sum"} (+ 1 2)')
		expect(v.title).toBe('Sum')
		expect(print(v.slots[0]!.replace(parse('5')))).toBe('^{label: "Sum"} (+ 5 2)')
		expect(view('^{label: "x"} 1').editor).toEqual({ kind: 'number', value: 1 })
	})

	it('leaves names, paths and functions to be edited as source', () => {
		for (const src of ['x', './a', '(=> (x: number): number x)']) {
			const v = view(src)
			expect(v.editor, src).toBeNull()
			expect(v.slots, src).toEqual([])
		}
	})

	it('does not name arguments it cannot place', () => {
		expect(labels('(+ ...[1 2])')).toEqual(['0'])
	})
})

describe('editing', () => {
	const replaced = (src: string, index: number, next: string) =>
		print(view(src).slots[index]!.replace(parse(next)))
	const removed = (src: string, index: number) =>
		print(view(src).slots[index]!.remove!())

	it('replaces a child and keeps the rest of the source', () => {
		expect(replaced('(+ 1  2)', 0, '9')).toBe('(+ 9 2)')
		expect(replaced('(take [1] n=1)', 1, '2')).toBe('(take [1] n=2)')
		expect(replaced('[1 2]', 1, '9')).toBe('[1 9]')
		expect(replaced('{x: 1 y: (+  1 2)}', 0, '9')).toBe('{x: 9 y: (+  1 2)}')
		expect(replaced('{a = 1 a}', 0, '9')).toBe('{a = 9 a}')
		expect(replaced('{a = 1 a}', 1, '(+ a 1)')).toBe('{a = 1 (+ a 1)}')
	})

	it('shares what did not change, so a Runtime can reuse it', () => {
		const ast = parse('[(+ 1 2) (+ 3 4)]')
		const before = viewOf(ast, env).slots
		const next = before[0]!.replace(parse('9'))
		const after = viewOf(next, env).slots
		expect(after[1]!.ast).toBe(before[1]!.ast)
	})

	it('removes what can go, and not what cannot', () => {
		expect(removed('[1 2 3]', 1)).toBe('[1 3]')
		expect(removed('{x: 1 y: 2}', 0)).toBe('{y: 2}')
		expect(removed('{a = 1 b = 2}', 0)).toBe('{b = 2}')
		expect(removed('(+ 1 2 3)', 1)).toBe('(+ 1 3)')
		expect(removed('(take [1] n=1)', 1)).toBe('(take [1])')
		expect(view('(take [1] 1)').slots[0]!.remove).toBeUndefined()
		expect(view('{a = 1 a}').slots[1]!.remove).toBeUndefined()
	})

	it('grows a variadic call and a vector', () => {
		expect(print(view('(+ 1)').append!.add())).toBe('(+ 1 0)')
		expect(print(view('[1 2]').append!.add())).toBe('[1 2 2]')
		expect(print(view('[]').append!.add())).toBe('[0]')
		expect(view('(take [1] 1)').append).toBeNull()
	})

	it('produces programs that evaluate', () => {
		const next = view('(+ 1 2)').slots[1]!.replace(parse('(* 2 3)'))
		expect(evaluate(next, env).value).toBe(7)
	})

	it('replaces a literal, keeping metadata', () => {
		expect(print(withLiteral(parse('1'), 2))).toBe('2')
		expect(print(withLiteral(parse('^{label: "x"} 1'), 2))).toBe('^{label: "x"} 2')
		expect(literalOf(parse('^{label: "x"} 1'))?.value).toBe(1)
		expect(literalOf(parse('(+ 1)'))).toBeNull()
	})
})

describe('head', () => {
	it('is a row of a call, apart from its arguments', () => {
		const v = view('(take [1 2] 1)')
		expect(v.head?.label).toBe('Function')
		expect(v.head?.display).toBe('take')
		expect(print(v.head!.ast)).toBe('take')
		expect(v.slots.map(s => s.label)).toEqual(['Items', 'Count'])
		expect(view('[1]').head).toBeNull()
	})

	it('can be replaced, and not removed', () => {
		const { head } = view('(take [1 2] 1)')
		expect(print(head!.replace(parse('drop')))).toBe('(drop [1 2] 1)')
		expect(head!.remove).toBeUndefined()
	})

	it('keeps metadata around the call', () => {
		const { head } = view('^{label: "Part"} (take [1 2] 1)')
		expect(print(head!.replace(parse('drop')))).toBe('^{label: "Part"} (drop [1 2] 1)')
	})

	it('is there for a call with no arguments', () => {
		expect(view('(+)').head?.display).toBe('+')
	})
})

describe('sort', () => {
	it('moves the elements of a vector', () => {
		const { sort } = view('[1 2 3]').slots[0]!
		expect(sort?.count).toBe(3)
		expect(print(sort!.move(0, 2))).toBe('[2 3 1]')
		expect(print(sort!.move(2, 0))).toBe('[3 1 2]')
	})

	it('moves variadic arguments, and nothing else of a call', () => {
		const v = view('(reduce [1] 0 max)')
		expect(v.slots.every(slot => slot.sort === undefined)).toBe(true)
		const { sort } = view('(+ 1 2 3)').slots[1]!
		expect(sort?.index).toBe(1)
		expect(print(sort!.move(1, 2))).toBe('(+ 1 3 2)')
	})

	it('does not move arguments around a spread', () => {
		expect(view('(+ 1 ...xs)').slots[0]!.sort).toBeUndefined()
	})

	it('keeps metadata around it', () => {
		const { sort } = view('^{label: "L"} [1 2]').slots[0]!
		expect(print(sort!.move(0, 1))).toBe('^{label: "L"} [2 1]')
	})

	it('works out a move from the orders before and after', () => {
		expect(moveBetween(['a', 'b', 'c'], ['b', 'c', 'a'])).toEqual([0, 2])
		expect(moveBetween(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([2, 0])
		expect(moveBetween(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual([0, 1])
		expect(moveBetween(['a', 'b'], ['a', 'b'])).toBeNull()
	})
})

describe('moveBinding', () => {
	const SOURCE = '{x = 10 y = (+ 1 2) z = {a = 20}}'
	const X = 'binding:x'
	const Y = 'binding:y'
	const Z = 'binding:z'
	const A = 'binding:z/binding:a'
	const move = (
		source: string,
		target: string,
		position: 'before' | 'after' | 'inside',
		program = SOURCE
	) => {
		const next = moveBinding(parse(program), env, source, target, position)
		return next === null ? null : print(next)
	}

	it('moves among its siblings', () => {
		expect(move(X, Y, 'after')).toBe('{y = (+ 1 2) x = 10 z = {a = 20}}')
		expect(move(X, Z, 'after')).toBe('{y = (+ 1 2) z = {a = 20} x = 10}')
		expect(move(Z, X, 'before')).toBe('{z = {a = 20} x = 10 y = (+ 1 2)}')
	})

	it('moves next to a binding in another let', () => {
		expect(move(X, A, 'before')).toBe('{y = (+ 1 2) z = {x = 10 a = 20}}')
		expect(move(X, A, 'after')).toBe('{y = (+ 1 2) z = {a = 20 x = 10}}')
	})

	it('moves into a let', () => {
		expect(move(X, Z, 'inside')).toBe('{y = (+ 1 2) z = {a = 20 x = 10}}')
	})

	it('moves out of a let', () => {
		expect(move(A, X, 'before')).toBe('{a = 20 x = 10 y = (+ 1 2) z = {}}')
		expect(move(A, Z, 'after')).toBe('{x = 10 y = (+ 1 2) z = {} a = 20}')
	})

	it('does not move into what is not a let', () => {
		expect(move(X, Y, 'inside')).toBeNull()
		expect(move(X, 'binding:y/arg0', 'before')).toBeNull()
		expect(move(X, 'binding:y/arg0', 'inside')).toBeNull()
	})

	it('does not move into itself', () => {
		expect(move(Z, A, 'before')).toBeNull()
		expect(move(Z, Z, 'inside')).toBeNull()
		expect(move(X, X, 'after')).toBeNull()
	})

	it('does not take a name that is taken', () => {
		const program = '{x = 1 z = {x = 2}}'
		expect(move(X, Z, 'inside', program)).toBeNull()
		expect(move(X, 'binding:z/binding:x', 'after', program)).toBeNull()
	})

	it('tells a sibling from a name like it', () => {
		expect(move('binding:z', 'binding:zz', 'after', '{z = 1 zz = {a = 1}}')).toBe(
			'{zz = {a = 1} z = 1}'
		)
		expect(move('binding:z', 'binding:zz', 'inside', '{z = 1 zz = {a = 1}}')).toBe(
			'{zz = {a = 1 z = 1}}'
		)
	})

	it('reaches a let under metadata', () => {
		expect(move(X, Z, 'inside', '{x = 1 z = ^{label: "L"} {a = 2}}')).toBe(
			'{z = ^{label: "L"} {a = 2 x = 1}}'
		)
	})

	it('reaches a let inside a call, and keeps a let its body', () => {
		expect(move(X, 'binding:y/arg0', 'inside', '{x = 1 y = (id {a = 2 a})}')).toBe(
			'{y = (id {a = 2 x = 1 a})}'
		)
	})
})

describe('parameter labels', () => {
	it('come from the definition in the prelude', () => {
		expect(labels('(map [1] (* % 2))')).toEqual(['Items', 'Transform'])
		expect(labels('(+ 1 2)')).toEqual(['Values 0', 'Values 1'])
		expect(view('(+ 1 2)').append?.label).toBe('Values')
		expect(view('(take [1])').missing[0]?.name).toBe('Count')
	})

	it('come from the metadata on a parameter type', () => {
		const session = new Session(env)
		session.exec('f = (=> (w: ^{label: "Width"} number h: number): number w)')
		expect(viewOf(parse('(f 1 2)'), session.env).slots.map(s => s.label)).toEqual([
			'Width',
			'h',
		])
	})

	it('come from params on a definition', () => {
		const session = new Session(env)
		session.exec('f = ^{params: {w: "Width"}} (=> (w: number): number w)')
		expect(viewOf(parse('(f 1)'), session.env).slots[0]?.label).toBe('Width')
	})

	it('work for a function written in place', () => {
		const v = view('((=> (w: ^{label: "Width"} number): number w) 1)')
		expect(v.slots[0]?.label).toBe('Width')
	})

	it('fall back to the name', () => {
		expect(labels('(** 2 3)')).toEqual(['base', 'Exponent'])
	})

	it('leave what the call means alone', () => {
		expect(evaluate(parse('(map [1 2] (* % 2))'), env).value).toEqual([2, 4])
	})
})

describe('renameBindingAt', () => {
	const rename = (src: string, path: string, name: string) => {
		const next = renameBindingAt(parse(src), env, path, name)
		return next === null ? null : print(next)
	}

	it('finds the let by the path', () => {
		expect(rename('{a = 1 b = (+ a 1)}', 'binding:a', 'c')).toBe('{c = 1 b = (+ c 1)}')
		expect(rename('{z = {a = 1 (+ a 1)}}', 'binding:z/binding:a', 'b')).toBe(
			'{z = {b = 1 (+ b 1)}}'
		)
	})

	it('reaches a let under metadata', () => {
		expect(rename('{z = ^{label: "L"} {a = 1}}', 'binding:z/binding:a', 'b')).toBe(
			'{z = ^{label: "L"} {b = 1}}'
		)
	})

	it('wants a binding', () => {
		expect(rename('{a = (+ 1 2)}', 'binding:a/arg0', 'b')).toBeNull()
		expect(rename('{a = 1}', 'binding:b', 'c')).toBeNull()
	})
})

describe('referenceTargetOf', () => {
	const target = (src: string, path: string) => referenceTargetOf(parse(src), env, path)

	it('finds the binding a name refers to', () => {
		expect(target('{a = 1 b = a}', 'binding:b')).toBe('binding:a')
		expect(target('{a = 1 b = (+ a 1)}', 'binding:b/arg0')).toBe('binding:a')
		expect(target('{a = 1 b = [a]}', 'binding:b/0')).toBe('binding:a')
	})

	it('goes by the nearest', () => {
		expect(target('{a = 1 z = {a = 2 b = a}}', 'binding:z/binding:b')).toBe(
			'binding:z/binding:a'
		)
		expect(target('{a = 1 z = {b = a}}', 'binding:z/binding:b')).toBe('binding:a')
	})

	it('has nothing for what is bound outside, or is not a name', () => {
		expect(target('{b = pi}', 'binding:b')).toBeNull()
		expect(target('{b = 1}', 'binding:b')).toBeNull()
		expect(target('{b = (+ 1 2)}', 'binding:b')).toBeNull()
		expect(target('{b = 1}', 'binding:c')).toBeNull()
	})
})

describe('numberOptions', () => {
	it('come from the metadata on a value', () => {
		expect(view('^{min: 0 max: 10 step: 2} 4').numberOptions).toEqual({ min: 0, max: 10, step: 2 })
		expect(view('^{min: 0} 5').numberOptions).toEqual({ min: 0 })
		expect(view('5').numberOptions).toEqual({})
	})

	it('come from the metadata on a parameter type', () => {
		const session = new Session(env)
		session.exec('f = (=> (w: ^{min: 0 max: 100} number h: number): number w)')
		const [w, h] = viewOf(parse('(f 1 2)'), session.env).slots
		expect(w?.numberOptions).toEqual({ min: 0, max: 100 })
		expect(h?.numberOptions).toEqual({})
	})

	it('say nothing that does not make sense', () => {
		expect(view('^{min: 1 max: 0} 5').numberOptions).toEqual({})
		expect(view('^{min: "a"} 5').numberOptions).toEqual({})
		expect(view('^{step: 0} 5').numberOptions).toEqual({})
	})

	it('change nothing about the value', () => {
		expect(evaluate(parse('^{min: 0 max: 10} 50'), env).value).toBe(50)
	})
})

describe('names', () => {
	it('capitalizes a name for a label', () => {
		expect(capitalCase('map')).toBe('Map')
		expect(capitalCase('to-string')).toBe('To String')
		expect(capitalCase('fooBar')).toBe('Foo Bar')
		expect(capitalCase('xs 0')).toBe('Xs 0')
		expect(capitalCase('0')).toBe('0')
		expect(capitalCase('*')).toBe('*')
		expect(capitalCase('-')).toBe('-')
		expect(capitalCase('円')).toBe('円')
	})

	it('prefers the label on the definition', () => {
		const session = new Session(env)
		session.exec('f = ^{label: "Fill" icon: "mdi:brush"} (=> (x: number): number x)')
		const v = viewOf(parse('(f 1)'), session.env)
		expect(v.title).toBe('Fill')
		expect(v.icon).toBeNull()
	})

	it('takes a label and icon from the node itself', () => {
		const v = view('^{label: "Width" icon: "mdi:ruler"} 100')
		expect(v.label).toBe('Width')
		expect(v.icon).toBe('mdi:ruler')
		expect(view('100').label).toBeNull()
	})
})

describe('icons', () => {
	const icon = (src: string, scope = env) => iconOf(parse(src), scope)

	it('comes from the metadata on the type', () => {
		expect(icon('1')).toBe('mdi:numeric')
		expect(icon('(* 2 3)')).toBe('mdi:numeric')
		expect(icon('"a"')).toBe('mdi:format-quote-close')
		expect(icon('[1 "a"]')).toBe('mdi:code-brackets')
		expect(icon('(map [1 2] (* % 2))')).toBe('mdi:code-brackets')
		expect(icon('(: 3 (refine number 1 (=> (x: number): boolean (> x 0))))')).toBe(
			'mdi:numeric'
		)
		expect(icon('(=> (x: number): number x)')).toBe('mdi:function-variant')
		expect(icon('{a: 1}')).toBe('mdi:code-braces')
	})

	it('leaves a node without a known type alone', () => {
		expect(icon('nothing-bound-here')).toBeNull()
	})

	it('has none without the frame', () => {
		expect(icon('1', buildPrelude())).toBeNull()
	})

	it('gives a call the icon of what it returns', () => {
		const session = new Session(env)
		session.exec('f = ^{icon: "mdi:brush"} (=> (x: number): string "a")')
		expect(icon('(f 1)', session.env)).toBe('mdi:format-quote-close')
		expect(icon('f', session.env)).toBe('mdi:function-variant')
	})

	it('takes the icon of a type a program defines', () => {
		const session = new Session(env)
		session.exec(
			'Len = ^{icon: "mdi:ruler"} (refine number 1 (=> (x: number): boolean (> x 0)))'
		)
		session.exec('Plain = (refine number 1 (=> (x: number): boolean (> x 0)))')
		session.exec('f = (=> (x: number): Len x)')
		session.exec('g = (=> (x: number): Plain x)')
		expect(icon('(f 1)', session.env)).toBe('mdi:ruler')
		expect(icon('(: 3 Len)', session.env)).toBe('mdi:ruler')
		expect(icon('(g 1)', session.env)).toBe('mdi:numeric')
	})

	it('prefers what is on the node itself', () => {
		expect(icon('^{icon: "fill:M0 0h24v24H0z"} 1')).toBe('fill:M0 0h24v24H0z')
	})

	it('lets a program shadow a type', () => {
		const session = new Session(env)
		const number = evaluate(parse('number'), env).value
		session.setBinding('number', meta({ icon: 'mdi:ruler' }, host(number)))
		expect(icon('1', session.env)).toBe('mdi:ruler')
	})

	it('changes nothing about what a type is', () => {
		expect(evaluate(parse('number'), env).value).toBe(
			evaluate(parse('number'), buildPrelude()).value
		)
		expect(evaluate(parse('(: "a" number)'), env).value).toBe(0)
	})
})

describe('problemOf', () => {
	const read = (ast: Parameters<typeof evaluate>[0], scope: Parameters<typeof evaluate>[1]) =>
		evaluate(ast, scope)
	const problem = (src: string) => problemOf(parse(src), env, null, read)

	it('reports what evaluating finds', () => {
		expect(problem('nope')).toContain('nope')
		expect(problem('(take [1])')).not.toBeNull()
		expect(problem('radius-is-not-bound')).not.toBeNull()
	})

	it('reports what never runs', () => {
		expect(problem('(=> (x: number): number nope)')).toContain('nope')
	})

	it('reports a problem inside, so that a closed row shows it', () => {
		expect(problem('(+ 1 nope)')).toContain('nope')
		expect(problem('[1 nope]')).toContain('nope')
	})

	it('reports a node that does not fit its slot', () => {
		const slot = view('(+ "a" 1)').slots[0]!
		expect(problemOf(slot.ast, slot.env, slot.expected, read)).toContain('type mismatch')
		const fine = view('(+ 2 1)').slots[0]!
		expect(problemOf(fine.ast, fine.env, fine.expected, read)).toBeNull()
	})

	it('does not judge by a slot that is still generic', () => {
		const session = new Session(env)
		session.exec('radius = 40')
		const call = viewOf(parse('(map [radius (* radius 2)] (* % 2))'), session.env)
		for (const slot of call.slots) {
			expect(problemOf(slot.ast, slot.env, slot.expected, read)).toBeNull()
		}
	})

	it('finds nothing wrong with what is fine', () => {
		for (const src of ['1', '(+ 1 2)', '[1 2]', '{a: 1}', '(* % 2)', '(map [1] (* % 2))', '%']) {
			expect(problem(src)).toBeNull()
		}
	})
})

describe('isExpression', () => {
	it('tells what is written down from what is worked out', () => {
		for (const src of ['1', '"a"', 'true', '[1 2]', '{a: 1}', '^{label: "x"} 1'])
			expect(isExpression(parse(src))).toBe(false)
		for (const src of ['x', '(+ 1 2)', '[1 x]', '{a: (+ 1 2)}', '../x', '^{label: "x"} y'])
			expect(isExpression(parse(src))).toBe(true)
	})
})

describe('actionsOf', () => {
	const slotOf = (src: string, index = 0) => view(src).slots[index]!
	const menu = (src: string, index = 0) =>
		actionsOf(slotOf(src, index)).map(a => a.label)
	const action = (src: string, label: string, index = 0) =>
		actionsOf(slotOf(src, index)).find(a => a.label === label)!

	it('offers what a slot allows', () => {
		expect(menu('[(+ 1 2)]')).toEqual([
			'Evaluate One Step',
			'Add Values',
			'Copy Value',
			'Copy Expression',
			'Delete',
		])
		expect(menu('[(take [1])]')).toEqual([
			'Evaluate One Step',
			'Add Count',
			'Copy Value',
			'Copy Expression',
			'Delete',
		])
		expect(menu('[[1]]')).toEqual(['Add Element', 'Copy Value', 'Delete'])
		expect(menu('[1]')).toEqual(['Copy Value', 'Delete'])
		expect(menu('(take [1] 1)', 1)).toEqual(['Copy Value'])
	})

	it('gives every action an icon', () => {
		for (const a of actionsOf(slotOf('[(+ 1 2)]'))) {
			expect(a.icon).toMatch(/^mdi:/)
		}
	})

	it('applies to the parent', () => {
		const apply = (label: string) => {
			const found = action('[(+ 1) 2]', label)
			return 'apply' in found ? print(found.apply()) : null
		}
		expect(apply('Add Values')).toBe('[(+ 1 0) 2]')
		expect(apply('Delete')).toBe('[2]')
	})

	it('evaluates one step, by the abstraction ladder', () => {
		const session = new Session(env)
		session.exec('sq = (=> (x: number): number (* x x))')
		const slot = viewOf(parse('[(sq 3)]'), session.env).slots[0]!
		const step = actionsOf(slot).find(a => a.label === 'Evaluate One Step')!
		expect('apply' in step && print(step.apply())).toBe('[(* 3 3)]')
	})

	it('goes to the value where there is no next rung', () => {
		const step = (src: string) => {
			const found = action(src, 'Evaluate One Step')
			return 'apply' in found ? print(found.apply()) : null
		}
		expect(step('[(+ 1 2)]')).toBe('[3]')
		expect(step('[(** 2 3)]')).toBe('[(* 2 2 2)]')
	})

	it('leaves alone what fails', () => {
		const found = action('[(+ 1 nope)]', 'Evaluate One Step')
		expect('apply' in found && print(found.apply())).toBe('[(+ 1 nope)]')
	})

	it('copies the value, and the source as written', () => {
		const copy = (src: string, label: string) => {
			const found = action(src, label)
			return 'copy' in found ? found.copy() : null
		}
		expect(copy('[(+ 1  2)]', 'Copy Value')).toBe('3')
		expect(copy('[(+ 1  2)]', 'Copy Expression')).toBe('(+ 1  2)')
		expect(copy('["a"]', 'Copy Value')).toBe('"a"')
	})

	it('offers no value for what has none', () => {
		const labels = actionsOf({ ...slotOf('[1]'), ast: parse('%') }).map(a => a.label)
		expect(labels).not.toContain('Copy Value')
		expect(labels).toContain('Copy Expression')
	})
})

describe('helpers', () => {
	it('gives the default of a type as source', () => {
		const t = view('(+ 1)').slots[0]!.expected
		expect(print(defaultFor(t, env))).toBe('0')
		expect(print(defaultFor(null, env))).toBe('0')
	})

	it('knows what has a value worth showing', () => {
		expect(hasValue(parse('(+ 1 2)'))).toBe(true)
		expect(hasValue(parse('x'))).toBe(true)
		expect(hasValue(parse('{a = 1 a}'))).toBe(true)
		expect(hasValue(parse('{a = 1}'))).toBe(false)
		expect(hasValue(parse('^{label: "x"} {a = 1}'))).toBe(false)
		expect(hasValue(parse('%'))).toBe(false)
	})

	it('parses source, or says it cannot', () => {
		expect(print(parseSource('(+ 1 2)')!)).toBe('(+ 1 2)')
		expect(parseSource('(+ 1')).toBeNull()
	})
})
