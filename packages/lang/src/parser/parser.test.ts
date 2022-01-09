import {
	all,
	call,
	dict,
	fn,
	fnType,
	id,
	isSame,
	never,
	Node,
	NodeMeta,
	num,
	param,
	scope,
	str,
	ValueMeta,
	vec,
} from '../ast'
import {parse} from '.'

const Num = id('Num')
const Bool = id('Bool')
const x = id('x')
const y = id('y')
const z = id('z')
const w = id('w')

describe('parsing literals', () => {
	testParsing('10', num(10))
	testParsing('   10   ', num(10))
	testParsing('   \t 5 \r\n', num(5))
	testParsing('false', id('false'))
	testParsing('true', id('true'))
	testParsing('"hello"', str('hello'))
	testParsing('"hello, world"', str('hello, world'))
	testParsing(' () ', call())
	testParsing(' (  \t   ) ', call())
	testParsing(' _ ', all())
	testParsing('Never', never())
})

describe('parsing symbols', () => {
	run('foo', 'foo')
	run('BAR', 'BAR')
	run('true1', 'true1')
	run('abc123 ', 'abc123')
	run('+-*&|<=>_', '+-*&|<=>_')
	run('変数', '変数')
	run('🍡', '🍡')
	// run('`a symbol with spaces`', 'a symbol with spaces')
	// run('`    `', '    ')
	// run('`_`', '_')
	// run('`( )`', '( )')
	run('symbol?', null)
	run('10deg', null)
	run('->', null)

	function run(input: string, expected: string | null) {
		if (expected) {
			testParsing(input, id(expected))
		} else {
			testErrorParsing(input)
		}
	}
})

describe('parsing line comment', () => {
	testParsing('1;comment', num(1))
	testParsing(';comment\n1', num(1))
	testParsing('1;comment\n\n', num(1))
	testParsing('1;comment\n;comment\n', num(1))
	testParsing(';comment\n;comment\n1', num(1))
	testParsing(';\n;\n1', num(1))
	testParsing('[;comment]\n1;comment]\n]', vec([num(1)]))
	testParsing(';;\n1', num(1))
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', call(id('+'), num(1), num(2)))
	testParsing('(* 1 2)', call(id('*'), num(1), num(2)))
	testParsing('(x _)', call(x, all()))
	testParsing('(x ())', call(x, call()))
	testParsing('(x)', call(x))
	testParsing('(0 false)', call(num(1), id('false')))
	testParsing('((true) x)', call(call(id('true')), x))
})

describe('parsing scope', () => {
	testParsing('(let x: 1 x)', scope({x: num(1)}, x))
	testParsing('(let x: 1)', scope({x: num(1)}))
	testParsing('(let x: (let x: 1))', scope({x: scope({x: num(1)})}))
	testParsing('(let (let 1))', scope({}, scope({}, num(1))))
	testParsing('(let)', scope({}))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', vec())
	testParsing('[    1   \t]', vec([num(1)]))
	testParsing('[1 2 3]', vec([num(1), num(2), num(3)]))
	testParsing('[1 [2] 3]', vec([num(1), vec([num(2)]), num(3)]))
	testParsing(
		'[(+) false (+) +]',
		vec([call(id('+')), id('false'), call(id('+')), id('+')])
	)
	testParsing('[...1]', vec([], 0, num(1)))
	testParsing('[1?]', vec([num(1)], 0))
	testParsing('[1? ...2]', vec([num(1)], 0, num(2)))
	testParsing('[1 2?]', vec([num(1), num(2)], 1))
	testParsing('[1 2? 3? ...4]', vec([num(1), num(2), num(3)], 1, num(4)))
	testErrorParsing('[1? 2]')
	testErrorParsing('[1? 2 3? 4?]')
})

describe('parsing dictionary', () => {
	testParsing('{   a:    1 }', dict({a: num(1)}))
	testParsing('{\t"foo bar": 1\t}', dict({'foo bar': num(1)}))
	testParsing('{   }', dict({}))
	testParsing('{a: A b: B}', dict({a: id('A'), b: id('B')}))
	testParsing('{a: {a: 1}}', dict({a: dict({a: num(1)})}))
	testParsing('{a?:1}', dict({a: num(1)}, ['a']))
	testParsing(
		'{a?:1 b:2 ...c}',
		dict(
			{
				a: num(1),
				b: num(2),
			},
			['a'],
			id('c')
		)
	)
})

describe('parsing function definition', () => {
	testParsing('(=> [x:Num] x)', fn({param: {x: Num}, body: x}))
	testParsing('(=> [ x: Num ] x)', fn({param: {x: Num}, body: x}))
	testParsing(
		'(=> [x: Num y: Bool] x)',
		fn({param: {x: Num, y: Bool}, body: x})
	)
	testParsing('(=> [] _)', fn({body: all()}))
	testParsing('(=> [] ())', fn({body: call()}))
	testParsing('(=> [] (+ 1 2))', fn({body: call(id('+'), num(1), num(2))}))
	testParsing('(=> [] (=> [] 1))', fn({body: fn({body: num(1)})}))

	// Polymorphic functions
	testParsing(
		'(=> <T> [x:T] x)',
		fn({typeVars: ['T'], param: {x: id('T')}, body: x})
	)
	testParsing(
		'(=> <T U> [x:T] x)',
		fn({typeVars: ['T', 'U'], param: {x: id('T')}, body: x})
	)
	testParsing('(=> <> [] Num)', fn({typeVars: [], body: Num}))
	testErrorParsing('(=> <1> [] Num)')

	// functions with rest parameter
	testParsing(
		'(=> [...x:x] y)',
		fn({param: param(undefined, undefined, {name: 'x', node: x}), body: y})
	)
	testParsing(
		'(=> [x:x ...y:y] z)',
		fn({param: param({x}, undefined, {name: 'y', node: y}), body: z})
	)
})

describe('parsing function type', () => {
	testParsing('(-> [a:[...x]] x)', fnType({param: {a: vec([], 0, x)}, out: x}))
	testParsing('(-> [x:_] _)', fnType({param: {x: all()}, out: all()}))
	testParsing('(-> [x:[]] ())', fnType({param: {x: vec()}, out: call()}))
	testParsing('(-> [] z)', fnType({out: z}))
	testParsing('(-> [] [])', fnType({out: vec()}))
	testParsing('(-> [x:x] z)', fnType({param: {x}, out: z}))
	testParsing('(-> [x:x y:y] z)', fnType({param: {x, y}, out: z}))
	testParsing('(-> [x:x y:y z:z] w)', fnType({param: {x, y, z}, out: w}))
	testParsing('(-> [a:[x y]] z)', fnType({param: {a: vec([x, y])}, out: z}))
	testParsing('(-> [x:x] z)', fnType({param: {x}, out: z}))
	testParsing('(-> [x:x y:y] z)', fnType({param: {x, y}, out: z}))

	testParsing(
		'(-> <T> [x:T] T)',
		fnType({typeVars: ['T'], param: {x: id('T')}, out: id('T')})
	)
	testParsing(
		'(-> <T U> [x:T] T)',
		fnType({typeVars: ['T', 'U'], param: {x: id('T')}, out: id('T')})
	)
	testErrorParsing('(-> <> [] Num)')
	testErrorParsing('(-> <1> [] Num)')

	testParsing('(-> [x?:x] y)', fnType({param: param({x}, 0), out: y}))
	testParsing('(-> [x?:x] y)', fnType({param: param({x}, 0), out: y}))
	testParsing('(-> [x?:x] y)', fnType({param: param({x}, 0), out: y}))
	testParsing('(-> [x:x y?:y] z)', fnType({param: param({x, y}, 1), out: z}))
})

describe('parsing metadata', () => {
	testParsing('0^0', num(0).setValueMeta(new ValueMeta(num(0))))
	testParsing('0^{0}', num(0).setValueMeta(new ValueMeta(num(0))))
	testParsing('0 \n^\t{0}', num(0).setValueMeta(new ValueMeta(num(0))))

	testParsing('_^{"hello"}', all().setValueMeta(new ValueMeta(str('hello'))))
	testParsing('()^{{}}', call().setValueMeta(new ValueMeta(dict())))
	testParsing('()^{}', call().setValueMeta(new ValueMeta()))

	testParsing('Bool^{true}', id('Bool').setValueMeta(new ValueMeta(id('true'))))

	testErrorParsing('Bool^true^true')
	testErrorParsing('Bool^{true}^{true}')

	testParsing(
		'layer#{collapsed: true}',
		id('layer').setNodeMeta(new NodeMeta(dict({collapsed: id('true')})))
	)

	testParsing(
		'Num^{0 label: "number"}#{prop: "A"}',
		id('Num')
			.setValueMeta(new ValueMeta(num(0), dict({label: str('number')})))
			.setNodeMeta(new NodeMeta(dict({prop: str('A')})))
	)

	testErrorParsing('layer#{}#{}')
	testErrorParsing('Num#{}^0')
})

function testParsing(input: string, expected: Node) {
	test(`parsing '${input}' to be ${expected.print()}`, () => {
		const result = parse(input)
		if (!isSame(result, expected)) {
			throw new Error('Not as same as expected, got=' + result.print())
		}
		// if (result.print() !== input) {
		// 	throw new Error(`Doesn't store CST properly, got='${result.print()}'`)
		// }
	})
}

function testErrorParsing(input: string) {
	test(`parsing '${input}' throws an error`, () => {
		try {
			const result = parse(input)
			throw new Error('Unexpectedly parsed as ' + result.print())
		} catch {
			return
		}
	})
}
