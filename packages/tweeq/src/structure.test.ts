import { type AST, buildPrelude, check, type Env, evaluate, host, isPinned, LetAST, makeTupleType, makeTypedFn, meta, parse, print, type RecordAST, Session, solve, type TypeValue, unpin, withTypeMeta } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { iconOf, withIcons } from './icons'
import { actionsOf, rowsWithAbsent, canSolve, elementAt, keepingRatio, numberOptionsAt, referenceAt, writtenReference, missingReferringTo, missingWritten, editorOfValue, defaultFor, hasValue, isExpression, isProportional, withProportional, expressionForNumber, expressionFromField, canStack, fitsInline, isAllOnItsRow, typeHintOf, numbersFit, kindIconOf, literalOf, moveBetween, moveBinding, readableDoc, referenceTargetOf, renameBindingAt, parseSource, problemOf, viewOf, withLiteral } from './structure'

const env = withIcons(buildPrelude())
const view = (src: string) => viewOf(parse(src), env)
const labels = (src: string) => view(src).slots.map(s => s.label)

describe('viewOf', () => {
	it('gives a literal a widget for its type', () => {
		expect(view('1').editor).toEqual({ kind: 'number', value: 1 })
		expect(view('"a"').editor).toEqual({ kind: 'string', value: 'a' })
		expect(view('true').editor).toEqual({ kind: 'boolean', value: true })
		expect(view('()').editor).toEqual({ kind: 'unit' })
	})

	it('gives a string a color input if its type says, unless it is no color at all', () => {
		const string = evaluate(parse('string'), env).value as TypeValue
		const color = withTypeMeta(string, parse('{input: "color"}') as RecordAST)
		expect(viewOf(parse('"#ff0000"'), env, color).editor).toEqual({ kind: 'color', value: '#ff0000' })
		expect(viewOf(parse('"none"'), env, color).editor).toEqual({ kind: 'string', value: 'none' })
		expect(viewOf(parse('"#ff0000"'), env, string).editor).toEqual({ kind: 'string', value: '#ff0000' })
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

	it('gives an enum widget the icons its type says, one for each value', () => {
		const session = new Session(env)
		session.exec('Join = (enum ^{icon: "a"} "round" ^{icon: "b"} "butt")')
		session.exec('f = (=> (j: Join): Join j)')
		const slot = viewOf(parse('(f "butt")'), session.env).slots[0]!
		expect(viewOf(slot.ast, slot.env, slot.expected).editor).toMatchObject({
			kind: 'enum',
			icons: ['a', 'b'],
		})

		session.exec('Short = (enum ^{icon: "a"} "round" "butt")')
		session.exec('g = (=> (j: Short): Short j)')
		const short = viewOf(parse('(g "butt")'), session.env).slots[0]!
		expect(viewOf(short.ast, short.env, short.expected).editor).not.toHaveProperty('icons')
	})

	it('finds no problem with a literal that is one of an enum, and does with one that is not', () => {
		const session = new Session(env)
		session.exec('J = (enum "a" "b")')
		const read = (ast: AST, at: Env) => evaluate(ast, at)
		const [fine] = viewOf(parse('(: "a" J)'), session.env).slots
		expect(problemOf(fine!.ast, fine!.env, fine!.expected, read)).toBeNull()
		const [wrong] = viewOf(parse('(: "z" J)'), session.env).slots
		expect(problemOf(wrong!.ast, wrong!.env, wrong!.expected, read)).toContain('type mismatch')
	})

	it('shows call arguments by parameter name', () => {
		expect(view('(take [1 2] 1)').title).toBe('Take')
		expect(labels('(take [1 2] 1)')).toEqual(['Items', 'Count'])
		expect(labels('(take [1 2] n=1)')).toEqual(['Items', 'Count'])
		expect(labels('(+ 1 2 3)')).toEqual(['0', '1', '2'])
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

	it('shows that parameter as what it comes to, which editing writes', () => {
		const { slot } = view('(take [1 2])').missing[0]!
		expect(print(slot!.ast)).toBe('0')
		expect(print(slot!.replace(parse('3')))).toBe('(take [1 2] n=3)')
		const hidden = view('^{label: "L"} (take [1 2])').missing[0]!.slot!
		expect(print(hidden.replace(parse('3')))).toContain('n=3')
	})

	it('keeps it where its parameter is, written or not, with the same key', () => {
		const number = evaluate(parse('number'), env).value as TypeValue
		const clamp = host(makeTypedFn([number, number, number], number, a => a, ['a', 'b', 'c']))
		const scoped: Env = { ast: new LetAST([], null), parent: env, bindings: new Map([['f', { ast: clamp, env: null }]]) }
		const keysOf = (src: string) => {
			const v = viewOf(parse(src), scoped)
			return rowsWithAbsent(v.slots, v.missing).map(({ key, absent }) => `${key}${absent ? '?' : ''}`)
		}
		expect(keysOf('(f 1)')).toEqual(['arg0', 'kw:b?', 'kw:c?'])
		expect(keysOf('(f 1 c=3)')).toEqual(['arg0', 'kw:b?', 'kw:c'])
		expect(keysOf('(f 1 c=3 b=2)')).toEqual(['arg0', 'kw:b', 'kw:c'])
	})

	it('reverts one written by name by leaving it out, and one by its place to the default', () => {
		const reverted = (src: string, key: string) => {
			const { slots } = view(src)
			const slot = slots.find(s => s.key === key) ?? slots[0]!
			const action = actionsOf(slot).find(({ label }) => label === 'Revert to Default')
			return action !== undefined && 'apply' in action ? print(action.apply()) : null
		}
		expect(reverted('(take [1 2] n=3)', 'kw:n')).toBe('(take [1 2])')
		expect(reverted('(take [1 2] 3)', 'arg1')).toBe('(take [1 2] 0)')
		expect(reverted('(take [1 2] 0)', 'arg1')).toBeNull()
		expect(reverted('{a: 1}', 'a')).toBeNull()
	})

	it('has nothing to do with it but write it', () => {
		const { slot } = view('(take [1 2])').missing[0]!
		expect(actionsOf(slot!)).toEqual([])
		expect(canSolve(slot!, 0)).toBe(false)
	})

	it('has no such thing to show for what a block could return', () => {
		expect(view('{a = 1}').missing[0]!.slot).toBeUndefined()
	})

	it('shows vectors, records and let-blocks by their children', () => {
		expect(labels('[1 2]')).toEqual(['0', '1'])
		expect(labels('{x: 1 y: 2}')).toEqual(['x', 'y'])
		expect(labels('{a = 1 b = 2 (+ a b)}')).toEqual(['a', 'b', 'Return'])
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
	})

	it('grows a variadic call and a vector', () => {
		expect(print(view('(+ 1)').append!.add())).toBe('(+ 1 0)')
		expect(print(view('[1 2]').append!.add())).toBe('[1 2 0]')
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
		expect(print(withLiteral(parse('@1'), 2))).toBe('@2')
		expect(print(withLiteral(parse('^{label: "x"} @1'), 2))).toBe('^{label: "x"} @2')
		expect(literalOf(parse('@1'))?.value).toBe(1)
		expect(literalOf(parse('(+ 1)'))).toBeNull()
	})
})

describe('head', () => {
	it('is a row of a call, apart from its arguments', () => {
		const v = view('(take [1 2] 1)')
		expect(v.head?.label).toBe('Take')
		expect(v.head?.role).toBe('function')
		expect(print(v.head!.ast)).toBe('take')
		expect(v.slots.map(s => s.label)).toEqual(['Items', 'Count'])
		expect(view('[1]').head).toBeNull()
	})

	it('has what the function says about itself', () => {
		expect(view('(+ 1 2)').head?.doc).toBeTruthy()
		const session = new Session(env)
		session.exec('f = ^{doc: "Fills it."} (=> (x: number): number x)')
		expect(viewOf(parse('(f 1)'), session.env).head?.doc).toBe('Fills it.')
		session.exec('g = (=> (x: number): number x)')
		expect(viewOf(parse('(g 1)'), session.env).head?.doc).toBeUndefined()
	})

	it('goes by the name, for a function with no label', () => {
		const session = new Session(env)
		session.exec('sq = (=> (x: number): number (* x x))')
		const { head } = viewOf(parse('(sq 2)'), session.env)
		expect(head?.label).toBe('sq')
		expect(head?.icon).toBe('mdi:function-variant')
	})

	it('has the label and icon of the function', () => {
		const session = new Session(env)
		session.exec('f = ^{label: "Fill" icon: "mdi:brush"} (=> (x: number): number x)')
		const { head } = viewOf(parse('(f 1)'), session.env)
		expect(head?.label).toBe('Fill')
		expect(head?.icon).toBe('mdi:brush')
		expect(view('(* 1 2)').head?.icon).toBe('mdi:close')
		expect(view('(* 1 2)').head?.label).toBe('Multiply')
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
		expect(view('(+)').head?.label).toBe('Add')
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

describe('forms that are not calls', () => {
	it('has no function in a cast', () => {
		const v = view('(: 20 number)')
		expect(v.head).toBeNull()
		expect(v.title).toBeNull()
		expect(v.slots.map(s => s.label)).toEqual(['Value', 'Type'])
		expect(v.append).toBeNull()
		expect(v.missing).toEqual([])
		expect(kindIconOf(parse('(: 20 number)'))).toBe('mdi:tag-outline')
	})

	it('expects of a cast the type it casts to', () => {
		const session = new Session(env)
		session.exec('J = (enum "a" "b")')
		const [value] = viewOf(parse('(: "a" J)'), session.env).slots
		expect(viewOf(value!.ast, value!.env, value!.expected).editor?.kind).toBe('enum')
		expect(print(value!.replace(parse('"b"')))).toBe('(: "b" J)')
	})

	it('names the parts of a match', () => {
		expect(view('(? v 1 "a" 2 "b")').slots.map(s => s.label)).toEqual([
			'Value',
			'Case 1',
			'Result 1',
			'Case 2',
			'Result 2',
		])
		expect(view('(? v 1 "a")').head).toBeNull()
	})

	it('reads a wildcard as what is left', () => {
		const v = view('(? v 1 "a" _ "b")')
		expect(v.slots.map(s => [s.label, s.role])).toEqual([
			['Value', 'subject'],
			['Case 1', 'pattern'],
			['Result 1', 'result'],
			['Otherwise', 'result'],
		])
		expect(print(v.slots[3]!.replace(parse('"c"')))).toBe('(? v 1 "a" _ "c")')
	})

	it('reads a match on true as an if', () => {
		const v = view('(? c true 1 _ 2)')
		expect(v.slots.map(s => s.label)).toEqual(['If', 'Then', 'Else'])
		expect(print(v.slots[2]!.replace(parse('3')))).toBe('(? c true 1 _ 3)')
		expect(view('(? c false 1 _ 2)').slots.map(s => s.label)).not.toContain('Then')
	})

	it('has each step know what comes before it', () => {
		const [, first, second] = view('(|> 2 sqrt abs)').slots
		expect(first?.role).toBe('step')
		expect(first?.display).toBe('sqrt')
		expect(print(first!.upTo!)).toBe('(|> 2 sqrt)')
		expect(print(second!.upTo!)).toBe('(|> 2 sqrt abs)')
	})

	it('marks what a call calls', () => {
		expect(view('(+ 1 2)').head?.role).toBe('function')
	})

	it('names the parts of a pipe, and lets the steps move', () => {
		const v = view('(|> 1 f g)')
		expect(v.head).toBeNull()
		expect(v.slots.map(s => s.label)).toEqual(['Input', 'Step 1', 'Step 2'])
		expect(v.slots[0]?.sort).toBeUndefined()
		expect(print(v.slots[1]!.sort!.move(0, 1))).toBe('(|> 1 g f)')
		expect(print(v.slots[2]!.remove!())).toBe('(|> 1 f)')
	})

	it('still treats a function as a function', () => {
		expect(view('(+ 1 2)').head?.label).toBe('Add')
	})
})

describe('docs', () => {
	it('says a parameter by its label', () => {
		expect(view('(reduce [1] 0 max)').head?.doc).toBe(
			'Folds Items into one with Combine, starting from Initial.'
		)
	})

	it('reads code without its backticks', () => {
		expect(readableDoc('`(*)` is 1', name => name)).toBe('(*) is 1')
	})

	it('says what a parameter is for', () => {
		const [items, transform] = view('(map [1] (* % 2))').slots
		expect(items?.doc).toBe('The vector to go through.')
		expect(transform?.doc).toBe('What to make of each element.')
		expect(view('(+ 1 2)').slots[0]?.doc).toBe('The numbers to add up.')
		expect(view('(+ 1 2)').append?.doc).toBe('The numbers to add up.')
	})

	it('takes a doc from a parameter type', () => {
		const session = new Session(env)
		session.exec('f = (=> (w: ^{doc: "How wide."} number): number w)')
		expect(viewOf(parse('(f 1)'), session.env).slots[0]?.doc).toBe('How wide.')
	})

	it('still reads params given as just labels', () => {
		const session = new Session(env)
		session.exec('f = ^{params: {w: "Width"}} (=> (w: number): number w)')
		expect(viewOf(parse('(f 1)'), session.env).slots[0]?.label).toBe('Width')
	})
})

describe('evaluating a name', () => {
	const step = (src: string, index: number) => {
		const slot = view(src).slots[index]!
		const found = actionsOf(slot).find(a => a.id === 'step')
		return found && 'apply' in found ? print(found.apply()) : null
	}

	it('goes to what it refers to', () => {
		expect(step('{a = (+ 1 2) b = a}', 1)).toBe('{a = (+ 1 2) b = (+ 1 2)}')
	})

	it('goes to the value for what has no expression', () => {
		expect(step('{a = pi}', 0)).toBe(`{a = ${Math.PI}}`)
	})

	it('leaves what is not bound', () => {
		expect(step('{a = nope}', 0)).toBe('{a = nope}')
	})

	it('is not offered for what a call calls', () => {
		const { head } = view('(+ 1 2)')
		expect(actionsOf(head!).map(a => a.id)).not.toContain('step')
	})
})

describe('evaluating everything', () => {
	const all = (src: string) => {
		const found = actionsOf(view(src).slots[0]!).find(a => a.id === 'all')
		return found && 'apply' in found ? print(found.apply()) : null
	}

	it('goes to the value', () => {
		expect(all('[(+ 1 (* 2 3))]')).toBe('[7]')
		expect(all('[(** 2 3)]')).toBe('[8]')
	})

	it('leaves alone what fails, and what is a function', () => {
		expect(all('[(+ 1 nope)]')).toBe('[(+ 1 nope)]')
		expect(all('[map]')).toBe('[map]')
	})

	it('is not there for what is written down', () => {
		expect(all('[1]')).toBeNull()
	})
})

describe('adding an element', () => {
	const add = (src: string) => print(view(src).append!.add())

	it('adds the default of what the vector holds', () => {
		expect(add('[1 2]')).toBe('[1 2 0]')
		expect(add('["a"]')).toBe('["a" ""]')
		expect(add('[true]')).toBe('[true false]')
	})

	it('goes by what an expression comes to, and does not copy it', () => {
		expect(add('[(+ 1 1)]')).toBe('[(+ 1 1) 0]')
	})

	it('adds a number with nothing to go by', () => {
		expect(add('[(=> (x: number): number x)]')).toBe('[(=> (x: number): number x) 0]')
	})

	it('goes by the slot if it says', () => {
		const slot = view('(take [] 1)').slots[0]!
		expect(viewOf(slot.ast, slot.env, slot.expected).append).not.toBeNull()
	})
})

describe('adding a binding', () => {
	it('adds one under a name that is free', () => {
		const add = (src: string) => print(view(src).append!.add())
		expect(add('{y = 1}')).toBe('{y = 1 x = 0}')
		expect(add('{x = 1}')).toBe('{x = 1 x2 = 0}')
		expect(add('{x = 1 x2 = 2}')).toBe('{x = 1 x2 = 2 x3 = 0}')
	})

	it('says which slot it adds', () => {
		expect(view('{x = 1}').append?.key).toBe('binding:x2')
		expect(view('^{label: "L"} {x = 1}').append?.key).toBe('binding:x2')
	})

	it('adds to an empty let, with nothing left over', () => {
		expect(print(view('{()}').append!.add())).toBe('{x = 0}')
	})

	it('keeps a body last', () => {
		expect(print(view('{a = 1 a}').append!.add())).toBe('{a = 1 x = 0 a}')
	})

	it('is in the menu', () => {
		const slot = view('{z = {a = 1}}').slots[0]!
		expect(actionsOf(slot).map(a => a.label)).toContain('Add Binding')
	})
})

describe('expressionForNumber', () => {
	const inside = view('{radius = 40 c = 1}').slots.at(-1)!.env
	const read = (ast: AST, at: Env) => evaluate(ast, at)
	const typed = (text: string) => {
		const result = expressionForNumber(text, inside, read)
		return 'ast' in result ? print(result.ast) : 'problem'
	}

	it('is code that comes to a number', () => {
		expect(typed('(* radius 2)')).toBe('(* radius 2)')
		expect(typed('radius')).toBe('radius')
	})

	it('can begin with a =', () => {
		expect(typed('=radius')).toBe('radius')
	})

	it('has a problem if it cannot be read, or worked out, or is not a number', () => {
		for (const text of ['(* radius', 'nothing', 'x*2', '"text"', '[1 2]', '']) {
			expect(typed(text), text).toBe('problem')
		}
	})
})

describe('expressionFromField', () => {
	const field = (value: string, start: number | null, end: number | null = start) => ({
		value,
		selectionStart: start,
		selectionEnd: end,
	})

	it('replaces what is selected', () => {
		expect(expressionFromField(field('40', 0, 2))).toBe('')
	})

	it('keeps what comes after the caret at the start', () => {
		expect(expressionFromField(field('40', 0))).toBe('40')
		expect(expressionFromField(field('40', 0, 1))).toBe('0')
	})

	it('is just a character anywhere else', () => {
		expect(expressionFromField(field('40', 1))).toBeNull()
		expect(expressionFromField(field('40', 2))).toBeNull()
	})

	it('starts empty where there is no text', () => {
		expect(expressionFromField(null)).toBe('')
		expect(expressionFromField(field('on', null))).toBe('')
	})
})

describe('keepingRatio', () => {
	it('has the others follow', () => {
		expect(keepingRatio(null, [100, 50], 0, 200).wrote).toEqual([200, 100])
		expect(keepingRatio(null, [100, 50], 1, 10).wrote).toEqual([20, 10])
	})

	it('comes back from 0 with the ratio it had', () => {
		const down = keepingRatio(null, [100, 50], 0, 0)
		expect(down.wrote).toEqual([0, 0])
		expect(keepingRatio(down, down.wrote, 0, 30).wrote).toEqual([30, 15])
	})

	it('goes by what the numbers are, once something else has changed them', () => {
		const first = keepingRatio(null, [100, 50], 0, 200)
		expect(keepingRatio(first, [10, 10], 0, 20).wrote).toEqual([20, 20])
	})

	it('leaves the others where there is no ratio to go by', () => {
		expect(keepingRatio(null, [0, 50], 0, 10).wrote).toEqual([10, 50])
	})
})

describe('proportional', () => {
	const toggled = (src: string, on: boolean) => print(withProportional(parse(src), env, on))
	const atS = parse('{s = ^{proportional: true} [100 50] s}')

	it('is what a node says of itself', () => {
		expect(isProportional(parse('^{proportional: true} [100 50]'), env)).toBe(true)
		expect(isProportional(parse('[100 50]'), env)).toBe(false)
		expect(isProportional(parse('^{proportional: false} [100 50]'), env)).toBe(false)
	})

	it('comes along from what is referred to', () => {
		expect(isProportional(atS, env)).toBe(true)
	})

	it('is written on the node, and joins what it says already', () => {
		expect(toggled('[100 50]', true)).toBe('^{proportional: true} [100 50]')
		expect(toggled('^{label: "L"} [100 50]', true)).toBe('^{label: "L" proportional: true} [100 50]')
		expect(toggled('@[100 50]', true)).toBe('^{proportional: true} @[100 50]')
	})

	it('leaves nothing behind when it is taken off', () => {
		expect(toggled('^{proportional: true} [100 50]', false)).toBe('[100 50]')
		expect(toggled('^{label: "L" proportional: true} [100 50]', false)).toBe('^{label: "L"} [100 50]')
	})

	it('changes no value', () => {
		const src = '^{proportional: true} [100 50]'
		expect(evaluate(parse(src), env).value).toEqual([100, 50])
	})
})

describe('elementAt', () => {
	it('is only an element of that vector itself', () => {
		expect(elementAt('c/arg1', 'c/arg1/1')).toBe(1)
		expect(elementAt('c/arg1', 'c/arg1')).toBe(null)
		expect(elementAt('c/arg1', 'c/arg1/0/arg0')).toBe(null)
		expect(elementAt('c/arg1', 'c/arg10/0')).toBe(null)
	})
})

describe('how a number is shown', () => {
	it('says so as metadata', () => {
		const slot = view('[^{min: 0 max: 1 scale: 100 suffix: "%"} 0.5]').slots[0]!
		expect(numberOptionsAt(slot)).toEqual({ min: 0, max: 1, scale: 100, suffix: '%' })
	})

	it('says nothing by a scale that would leave nothing to show', () => {
		const slot = view('[^{scale: 0} 0.5]').slots[0]!
		expect(numberOptionsAt(slot)).toEqual({})
	})
})

describe('numbersFit', () => {
	it('goes without icons before going one above another', () => {
		expect(numbersFit(2, 130)).toBe('side')
		expect(numbersFit(2, 129)).toBe('bare')
		expect(numbersFit(2, 90)).toBe('bare')
		expect(numbersFit(2, 89)).toBe('stacked')
	})

	it('takes a width not yet measured to fit', () => {
		expect(numbersFit(2, 0)).toBe('side')
	})
})

describe('canStack', () => {
	it('is for a few numbers', () => {
		expect(canStack([1, 2])).toBe(true)
		expect(canStack([1, 2, 3, 4])).toBe(true)
	})

	it('is not for many of them, or anything else', () => {
		expect(canStack([1, 2, 3, 4, 5])).toBe(false)
		expect(canStack([])).toBe(false)
		expect(canStack([1, 'a'])).toBe(false)
		expect(canStack(1)).toBe(false)
	})
})

describe('fitsInline', () => {
	it('goes by whether inputs of the least width fit', () => {
		expect(fitsInline(1, 64)).toBe(true)
		expect(fitsInline(1, 63)).toBe(false)
		expect(fitsInline(3, 196)).toBe(true)
		expect(fitsInline(3, 195)).toBe(false)
		expect(fitsInline(10, 1000)).toBe(true)
	})

	it('has nothing to fit for nothing', () => {
		expect(fitsInline(0, 1000)).toBe(false)
	})

	it('takes a width not yet measured to fit', () => {
		expect(fitsInline(100, 0)).toBe(true)
	})
})

describe('kindIconOf', () => {
	const kind = (src: string) => kindIconOf(parse(src))

	it('tells kinds of expression apart', () => {
		expect(kind('(+ 1 2)')).toBe('mdi:function-variant')
		expect(kind('{a = 1 a}')).toBe('mdi:graph-outline')
		expect(kind('(=> (x: number): number x)')).toBe('mdi:lambda')
		expect(kind('x')).toBe('mdi:arrow-top-right')
		expect(kind('../x')).toBe('mdi:arrow-top-right')
		expect(kind('[1 x]')).toBe('mdi:code-brackets')
		expect(kind('{a: x}')).toBe('mdi:code-braces')
		expect(kind('^{label: "L"} (+ 1 2)')).toBe('mdi:function-variant')
		expect(kind('(: 1 number)')).toBe('mdi:tag-outline')
		expect(kind('(? 1 1 2)')).toBe('mdi:call-split')
		expect(kind('(|> 1 f)')).toBe('mdi:pipe')
	})

	it('is the same for a name, whether or not it can be gone to', () => {
		expect(kindIconOf(parse('x'))).toBe('mdi:arrow-top-right')
		expect(kindIconOf(parse('pi'))).toBe('mdi:arrow-top-right')
		expect(kindIconOf(parse('^{label: "L"} pi'))).toBe('mdi:arrow-top-right')
		expect(kindIconOf(parse('../x'))).toBe('mdi:arrow-top-right')
	})

	it('has nothing for what is written down', () => {
		for (const src of ['1', '"a"', '[1 2]', '{a: 1}']) expect(kind(src)).toBeNull()
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
		expect(move(A, X, 'before')).toBe('{a = 20 x = 10 y = (+ 1 2) z = {()}}')
		expect(move(A, Z, 'after')).toBe('{x = 10 y = (+ 1 2) z = {()} a = 20}')
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

	it('moves into a let that it has emptied, and back', () => {
		const emptied = move(A, Z, 'after')!
		expect(emptied).toContain('z = {()}')
		const next = moveBinding(parse(emptied), env, 'binding:a', Z, 'inside')
		expect(print(next!)).toBe(SOURCE)
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
		expect(labels('(+ 1 2)')).toEqual(['0', '1'])
		expect(view('(+ 1 2)').append?.label).toBe('Values')
		expect(view('(take [1])').missing[0]?.name).toBe('Count')
	})

	it('take the name of a variadic overload', () => {
		expect(labels('(++ [1] [2])')).toEqual(['0', '1'])
		expect(labels('(++ "a" "b")')).toEqual(['0', '1'])
		expect(view('(++ [1])').append?.label).toBe('Values')
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
		const session = new Session(env)
		session.exec('f = (=> (w: number): number w)')
		expect(viewOf(parse('(f 1)'), session.env).slots[0]?.label).toBe('w')
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

	it('takes along a path from outside the let', () => {
		expect(rename('{z = {a = 1} q = ./z/a}', 'binding:z/binding:a', 'b')).toBe(
			'{z = {b = 1} q = ./z/b}'
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
		expect(icon('1')).toBe('mdi:pound')
		expect(icon('(* 2 3)')).toBe('mdi:pound')
		expect(icon('"a"')).toBe('mdi:format-quote-close')
		expect(icon('[1 "a"]')).toBe('mdi:code-brackets')
		expect(icon('(map [1 2] (* % 2))')).toBe('mdi:code-brackets')
		expect(icon('(: 3 (refine number 1 (=> (x: number): boolean (> x 0))))')).toBe(
			'mdi:pound'
		)
		expect(icon('(=> (x: number): number x)')).toBe('mdi:function-variant')
		expect(icon('{a: 1}')).toBe('mdi:code-braces')
	})

	it('goes by what a parameter is for, over what the value happens to be', () => {
		const number = evaluate(parse('number'), env).value as TypeValue
		const plain = makeTupleType([number, number])
		const wanted = withTypeMeta(plain, parse('{icon: "ph:crosshair"}') as RecordAST)
		expect(iconOf(parse('[1 2]'), env, wanted)).toBe('ph:crosshair')
		expect(iconOf(parse('^{icon: "own"} [1 2]'), env, wanted)).toBe('own')
		expect(iconOf(parse('[1 2]'), env, plain)).toBe('mdi:code-brackets')
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
		session.exec('Plain = (refine number 1 (=> (x: number): boolean (>= x 0)))')
		session.exec('f = (=> (x: number): Len x)')
		session.exec('g = (=> (x: number): Plain x)')
		expect(icon('(f 1)', session.env)).toBe('mdi:ruler')
		expect(icon('(: 3 Len)', session.env)).toBe('mdi:ruler')
		expect(icon('(g 1)', session.env)).toBe('mdi:pound')
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
			'Evaluate All',
			'Add Values',
			'Pin',
			'Hide',
			'Copy Value',
			'Copy Expression',
			'Delete',
		])
		expect(menu('[(take [1])]')).toEqual([
			'Evaluate One Step',
			'Evaluate All',
			'Add Count',
			'Pin',
			'Hide',
			'Copy Value',
			'Copy Expression',
			'Delete',
		])
		expect(menu('[[1]]')).toEqual(['Add Element', 'Pin', 'Hide', 'Copy Value', 'Delete'])
		expect(menu('[1]')).toEqual(['Pin', 'Hide', 'Copy Value', 'Delete'])
		expect(menu('(take [1] 1)', 1)).toEqual(['Revert to Default', 'Pin', 'Hide', 'Copy Value'])
		expect(menu('(take [1] 0)', 1)).toEqual(['Pin', 'Hide', 'Copy Value'])
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
		expect(copy('["a"]', 'Copy Value')).toBe('a')
		expect(copy('[(++ "a" "b")]', 'Copy Value')).toBe('ab')
		expect(copy('[1.5]', 'Copy Value')).toBe('1.5')
	})

	it('offers no value for what has none', () => {
		const labels = actionsOf({ ...slotOf('[1]'), ast: parse('%') }).map(a => a.label)
		expect(labels).not.toContain('Copy Value')
		expect(labels).toContain('Copy Expression')
	})
})

describe('hiding from a menu', () => {
	const toggled = (src: string) => {
		const action = actionsOf(view(src).slots[0]!).find(a => a.id === 'hide')!
		return 'apply' in action ? print(action.apply()) : null
	}

	it('hides and shows, keeping other metadata', () => {
		expect(toggled('{a = 1}')).toBe('{a = #_1}')
		expect(toggled('{a = #_1}')).toBe('{a = 1}')
		expect(toggled('{a = @1}')).toBe('{a = #_@1}')
		expect(toggled('{a = ^{label: "L"} 1}')).toBe('{a = ^{label: "L"} #_1}')
	})
})

describe('pinning from a menu', () => {
	const toggled = (src: string) => {
		const slot = view(src).slots[0]!
		const action = actionsOf(slot).find(a => a.label === 'Pin' || a.label === 'Unpin')!
		return 'apply' in action ? print(action.apply()) : null
	}

	it('pins and unpins, keeping other metadata', () => {
		expect(toggled('{a = 1}')).toBe('{a = @1}')
		expect(toggled('{a = @1}')).toBe('{a = 1}')
		expect(toggled('{a = @(+ 1 2)}')).toBe('{a = (+ 1 2)}')
		expect(toggled('{a = ^{label: "L"} 1}')).toBe('{a = ^{label: "L"} @1}')
		expect(toggled('{a = ^{label: "L"} @1}')).toBe('{a = ^{label: "L"} 1}')
	})

	it('has nothing to pin in what a call calls', () => {
		const head = view('(+ 1 2)').head!
		expect(actionsOf(head).map(a => a.label)).not.toContain('Pin')
	})

	it('leaves alone what is not pinned', () => {
		const ast = parse('^{label: "L"} 1')
		expect(unpin(ast)).toBe(ast)
		expect(isPinned(unpin(parse('@1')))).toBe(false)
	})
})

describe('editing a value that is worked out', () => {
	const row = (src: string) => view(src).slots[0]!

	it('is for what is worked out, and not pinned', () => {
		expect(canSolve(row('{a = (+ 1 2)}'), 3)).toBe(true)
		expect(canSolve(row('{a = 1}'), 1)).toBe(false)
		expect(canSolve(row('{a = @(+ 1 2)}'), 3)).toBe(false)
		expect(canSolve(row('{a = (+ 1 2)}'), 'x')).toBe(false)
		expect(canSolve(row('{a = (or true false)}'), true)).toBe(true)
		expect(canSolve(row('{a = true}'), true)).toBe(false)
		expect(canSolve(row('{a = (map [1 2] (* % 2))}'), [2, 4])).toBe(true)
		expect(canSolve(row('{a = (map [1 2] (* % 2))}'), [])).toBe(false)
		expect(canSolve(row('{a = (map ["x"] %)}'), ['x'])).toBe(false)
		expect(canSolve(row('{x = 1 a = [x x]}'), [1, 1])).toBe(false)
		expect(canSolve(row('{a = (+ 1 2)}'), Infinity)).toBe(false)
	})

	it('reaches back through a row, from where the editor stands', () => {
		const session = new Session(env)
		session.exec('a = 1')
		session.exec('r = (+ a @1)')
		const root = session.ast()
		const slot = viewOf(root, session.env).slots[1]!
		const nested = viewOf(slot.ast, slot.env).slots[0]!
		expect(print(solve(root, session.env, slot.ast, 10).ast!)).toContain('a = 9')
		expect(print(solve(root, session.env, nested.ast, 4).ast!)).toContain('a = 4')
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

describe('referenceAt', () => {
	const linked = (src: string, source: string, target: string) => {
		const next = referenceAt(parse(src), env, source, target)
		return next === null ? null : print(next)
	}

	it('refers by name, where the name means it', () => {
		expect(linked('{a = 1 b = 2}', 'binding:b', 'binding:a')).toBe('{a = 1 b = a}')
		expect(linked('{a = 1 q = (+ 0 1)}', 'binding:q/arg0', 'binding:a')).toBe('{a = 1 q = (+ a 1)}')
		expect(linked('{a = 1 q = {r = 2}}', 'binding:q/binding:r', 'binding:a')).toBe('{a = 1 q = {r = a}}')
	})

	it('refers by a path to what has no name there', () => {
		expect(linked('{z = {a = 1} q = 0}', 'binding:q', 'binding:z/binding:a')).toBe('{z = {a = 1} q = ./z/a}')
		expect(linked('{z = {x: 1} q = 0}', 'binding:q', 'binding:z/field:x')).toBe('{z = {x: 1} q = ./z/x}')
		expect(linked('{z = [1 2] q = 0}', 'binding:q', 'binding:z/1')).toBe('{z = [1 2] q = ./z/1}')
		expect(linked('{a = 1 q = {a = 2 r = 0}}', 'binding:q/binding:r', 'binding:a')).toBe(
			'{a = 1 q = {a = 2 r = ../a}}'
		)
	})

	it('refers to an element of what a call is given, and from one', () => {
		const next = referenceAt(parse('{f = (=> (p: _): _ p) a = (f [3 4]) b = (f [0 0]) b}'), env, 'binding:b/arg0/0', 'binding:a/arg0/1')!
		expect(print(next)).toContain('b = (f [../../a/p/1 0])')
		expect(evaluate(next, env).value).toEqual([4, 0])
	})

	it('evaluates to what it refers to', () => {
		const next = referenceAt(parse('{z = {a = 7} q = 0 q}'), env, 'binding:q', 'binding:z/binding:a')!
		expect(evaluate(next, env).value).toBe(7)
	})

	it('keeps metadata', () => {
		expect(linked('{a = 1 b = ^{label: "B"} 2}', 'binding:b', 'binding:a')).toBe('{a = 1 b = ^{label: "B"} a}')
	})

	it('does not refer to itself, or to what holds it', () => {
		expect(linked('{a = 1}', 'binding:a', 'binding:a')).toBeNull()
		expect(linked('{a = {b = 1}}', 'binding:a/binding:b', 'binding:a')).toBeNull()
	})

	it('wants both to be there', () => {
		expect(linked('{a = 1}', 'binding:a', 'binding:z')).toBeNull()
		expect(linked('{a = 1}', 'binding:z', 'binding:a')).toBeNull()
	})
})

describe('what a call is not yet given', () => {
	const program = '{f = (=> (a: number b?: string): number a) x = (f 1 b="red") y = (f 2)}'

	it('can refer to something, where it comes to be said', () => {
		const next = missingReferringTo(parse(program), env, 'binding:y', 'b', 'binding:x/kw:b')!
		expect(print(next)).toContain('y = (f 2 b=../x/b)')
	})

	it('can be written', () => {
		const next = missingWritten(parse(program), env, 'binding:y', 'b', parse('"blue"'))!
		expect(print(next)).toContain('y = (f 2 b="blue")')
	})

	it('is nothing to do of what is given already, or what is not there', () => {
		expect(missingWritten(parse(program), env, 'binding:x', 'b', parse('"blue"'))).toBeNull()
		expect(missingWritten(parse(program), env, 'binding:y', 'z', parse('"blue"'))).toBeNull()
		expect(missingReferringTo(parse(program), env, 'binding:y', 'b', 'binding:z')).toBeNull()
	})
})

describe('a string that is expected to be long', () => {
	const of = (fields: string) =>
		withTypeMeta(evaluate(parse('string'), env).value as TypeValue, parse(`{${fields}}`) as RecordAST)

	it('shows only what it is, as its type says', () => {
		expect(editorOfValue('M 0,0', of('input: "long-text" icon: "ph:path" summary: "SVG Path"'))).toEqual({
			kind: 'longText',
			value: 'M 0,0',
			label: 'SVG Path',
			icon: 'ph:path',
		})
		expect(editorOfValue('x', of('input: "long-text"'))).toEqual({ kind: 'longText', value: 'x', label: 'Text' })
	})

	it('is not what any other string is', () => {
		expect(editorOfValue('x', of('label: "L"'))).toEqual({ kind: 'string', value: 'x' })
	})
})

describe('a string, that comes from elsewhere', () => {
	const row = (src: string) => viewOf(parse(src), env).slots.at(-1)!

	it('can be sent back by what refers to it, and not by what works it out', () => {
		expect(canSolve(row('{s = "x" a = s}'), 'x')).toBe(true)
		expect(canSolve(row('{s = {t = "x"} a = ./s/t}'), 'x')).toBe(true)
		expect(canSolve(row('{a = "x"}'), 'x')).toBe(false)
		expect(canSolve(row('{f = (=> (n?: number): string "x") a = (f)}'), 'x')).toBe(false)
	})

	it('has the widget it would have had if written', () => {
		const shades = evaluate(parse('(enum "a" "b")'), env).value as Parameters<typeof editorOfValue>[1]
		expect(editorOfValue('a', null)).toEqual({ kind: 'string', value: 'a' })
		expect(editorOfValue('a', shades)).toMatchObject({ kind: 'enum', value: 'a', options: ['a', 'b'] })
	})

	it('comes back to where it is written', () => {
		const root = parse('{s = "x" a = s}')
		const slot = viewOf(root, env).slots.at(-1)!
		expect(print(solve(root, env, slot.ast, 'y').ast!)).toBe('{s = "y" a = s}')
	})
})

describe('writtenReference', () => {
	const written = (src: string, path: string) => writtenReference(parse(src), env, path)

	it('is a name for what is at the top', () => {
		expect(written('{a = 1}', 'binding:a')).toBe('a')
	})

	it('is a path from the top to anything further in', () => {
		expect(written('{a = [1 2]}', 'binding:a/1')).toBe('./a/1')
		expect(written('{f = (=> (p: _): _ p) a = (f [3 4])}', 'binding:a/arg0/1')).toBe('./a/p/1')
	})

	it('comes to it, as code at the top of the program', () => {
		const src = '{a = [3 4] b = ' + written('{a = [3 4]}', 'binding:a/1') + ' b}'
		expect(evaluate(parse(src), env).value).toBe(4)
	})

	it('is nothing, of what is not there', () => {
		expect(written('{a = 1}', 'binding:z')).toBeNull()
	})
})

describe('what a block returns', () => {
	it('can be added, and goes last', () => {
		const block = view('{a = 1}')
		expect(block.missing.map(m => m.name)).toEqual(['Return'])
		expect(print(block.missing[0]!.add())).toBe('{a = 1 0}')
	})

	it('can be deleted, and bindings go ahead of it', () => {
		const block = view('{a = 1 a}')
		expect(block.missing).toEqual([])
		const returned = block.slots.find(s => s.key === 'body')!
		expect(returned.label).toBe('Return')
		expect(print(returned.remove!())).toBe('{a = 1}')
		expect(print(block.append!.insert(1))).toBe('{a = 1 x = 0 a}')
		expect(print(block.append!.add())).toBe('{a = 1 x = 0 a}')
	})
})

describe('adding in the middle', () => {
	const inserted = (src: string, at: number) => print(view(src).append!.insert(at))

	it('goes before the one at that place of a call', () => {
		expect(inserted('(* 2 3)', 0)).toBe('(* 1 2 3)')
		expect(inserted('(* 2 3)', 1)).toBe('(* 2 1 3)')
		expect(inserted('(* 2 3)', 2)).toBe('(* 2 3 1)')
	})

	it('counts only what can grow, past what has a name', () => {
		const call = view('(concat "a" "b")')
		const fixed = call.append === null ? null : print(call.append.insert(0))
		expect(fixed === null || fixed.includes('"a"')).toBe(true)
	})

	it('goes before the one at that place of a vector and a block', () => {
		expect(inserted('[1 2]', 1)).toBe('[1 0 2]')
		expect(inserted('{a = 1 b = 2}', 1)).toBe('{a = 1 x = 0 b = 2}')
		expect(inserted('{x = 1}', 0)).toBe('{x2 = 0 x = 1}')
	})

	it('keeps metadata around it', () => {
		expect(inserted('^{label: "L"} [1 2]', 0)).toBe('^{label: "L"} [0 1 2]')
	})
})

describe('adding an argument', () => {
	const added = (src: string) => print(view(src).append!.add())

	it('starts from what changes nothing', () => {
		expect(added('(+ 2)')).toBe('(+ 2 0)')
		expect(added('(* 2)')).toBe('(* 2 1)')
		expect(added('(- 2)')).toBe('(- 2 0)')
		expect(added('(/ 2)')).toBe('(/ 2 1)')
		expect(added('(and false)')).toBe('(and false true)')
		expect(added('(or true)')).toBe('(or true false)')
	})

	it('still takes what fits', () => {
		const session = new Session(env)
		expect(check(parse('(* 2 3)'), session.env)).toEqual([])
		expect(check(parse('(and true false)'), session.env)).toEqual([])
		expect(check(parse('(* "a")'), session.env)).not.toEqual([])
	})
})

describe('what a type brings to a number field', () => {
	it('brings an icon along', () => {
		const session = new Session(env)
		session.setAst(parse('{P = ^{icon: "mdi:percent"} number a = (: 1 P)}') as never)
		const row = viewOf(session.ast(), session.env).slots.find(s => s.key === 'binding:a')!
		expect(iconOf(row.ast, row.env)).toBe('mdi:percent')
	})

	const rowOf = (src: string, key: string) => {
		const session = new Session(env)
		session.setAst(parse(src) as never)
		return viewOf(session.ast(), session.env).slots.find(s => s.key === key)!
	}
	const PERCENT = 'Percent = ^{label: "Pct" min: 0 max: 100 suffix: "%"} number'
	const OPTIONS = { min: 0, max: 100, suffix: '%' }

	it('reads prefix and suffix', () => {
		expect(view('^{prefix: "$" suffix: "%"} 5').numberOptions).toEqual({ prefix: '$', suffix: '%' })
	})

	it('reaches a value through its name and its type', () => {
		expect(numberOptionsAt(rowOf(`{a = ^{suffix: "%"} 5 b = a}`, 'binding:b'))).toEqual({ suffix: '%' })
		expect(numberOptionsAt(rowOf(`{${PERCENT} a = (: 5 Percent)}`, 'binding:a'))).toEqual(OPTIONS)
	})

	it('reaches an argument through a parameter, which keeps its own name', () => {
		const call = rowOf(`{${PERCENT} f = (=> (p: Percent): number p) a = (f 1)}`, 'binding:a')
		const arg = viewOf(call.ast, call.env).slots[0]!
		expect(arg.numberOptions).toEqual(OPTIONS)
		expect(arg.label).toBe('p')
		expect(numberOptionsAt(arg)).toEqual(OPTIONS)
	})
})

describe('what a default is written as', () => {
	const env = buildPrelude()
	const typeOf = (src: string, within: Env = env) => evaluate(parse(src), within).value as TypeValue

	it('is the expression it was written as', () => {
		expect(print(defaultFor(typeOf('^{default: (+ 1 2)} number'), env))).toBe('(+ 1 2)')
		expect(typeOf('^{default: (+ 1 2)} number').default).toBe(3)
	})

	it('is a new one each time, as a node is where it is', () => {
		const type = typeOf('^{default: (+ 1 2)} number')
		expect(defaultFor(type, env)).not.toBe(defaultFor(type, env))
	})

	it('is what it comes to where it would not mean the same', () => {
		const here: Env = { ast: new LetAST([], null), parent: env, bindings: new Map([['x', { ast: parse('3'), env }]]) }
		expect(print(defaultFor(typeOf('^{default: x} number', here), env))).toBe('3')
	})

	it('has to be of the type', () => {
		const type = typeOf('^{default: "no"} number')
		expect(type.default).toBe(0)
		expect(print(defaultFor(type, env))).toBe('0')
		expect(check(parse('^{default: "no"} number'), env).some(({ level }) => level === 'error')).toBe(true)
	})
})

describe('what a type is called, and what there is to open', () => {
	const typed = (fields: string) =>
		withTypeMeta(makeTupleType([numberType, numberType]), parse(`{${fields}}`) as RecordAST)
	const numberType = evaluate(parse('number'), env).value as TypeValue

	it('goes by what it says, or what sort of thing it is, rather than what it is made of', () => {
		expect(typeHintOf(typed('name: "point"'))).toBe('point')
		expect(typeHintOf(makeTupleType([numberType, numberType]))).toBe('vector')
		expect(typeHintOf(numberType)).toBe('number')
		expect(typeHintOf(null)).toBe(null)
	})

	it('has nothing to open a place or a size for when its row has all of it', () => {
		expect(isAllOnItsRow(parse('[1 -2]'), typed('input: "translate"'))).toBe(true)
		expect(isAllOnItsRow(parse('[1 2]'), typed('input: "size"'))).toBe(true)
	})

	it('still opens for an expression in it, or what is not a place or a size', () => {
		expect(isAllOnItsRow(parse('[1 (+ 1 1)]'), typed('input: "translate"'))).toBe(false)
		expect(isAllOnItsRow(parse('(+ 1 1)'), typed('input: "translate"'))).toBe(false)
		expect(isAllOnItsRow(parse('[1 2]'), makeTupleType([numberType, numberType]))).toBe(false)
	})
})
