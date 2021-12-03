import {
	all,
	app,
	bottom,
	dict,
	dictFrom,
	fn,
	isEqual,
	Node,
	num,
	obj,
	scope,
	str,
	sym,
	tyFn,
	unit,
	vec,
	vecFrom,
} from '../exp'
import {tyVar} from '../val'
import {parse} from '.'

const Num = sym('Num')
const Bool = sym('Bool')
const x = sym('x')
const y = sym('y')
const z = sym('z')
const w = sym('w')

describe('parsing literals', () => {
	testParsing('10', num(10))
	testParsing('   10   ', num(10))
	testParsing('   \t 5 \r\n', num(5))
	testParsing('false', sym('false'))
	testParsing('true', sym('true'))
	testParsing('"hello"', str('hello'))
	testParsing('"hello, world"', str('hello, world'))
	testParsing(' () ', unit())
	testParsing(' (  \t   ) ', unit())
	testParsing(' _ ', all())
	testParsing('_|_', bottom())
	testParsing('<T>', obj(tyVar('T')))
})

describe('parsing symbols', () => {
	run('foo', 'foo')
	run('BAR', 'BAR')
	run('true1', 'true1')
	run('abc123 ', 'abc123')
	run('+-*/&|<=>_', '+-*/&|<=>_')
	run('変数', '変数')
	run('🍡', '🍡')
	run('`a symbol with spaces`', 'a symbol with spaces')
	run('`    `', '    ')
	run('`_`', '_')
	run('`( )`', '( )')
	run('symbol?', null)
	run('10deg', null)
	run('->', null)

	function run(input: string, expected: string | null) {
		if (expected) {
			testParsing(input, sym(expected))
		} else {
			testErrorParsing(input)
		}
	}
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', app(sym('+'), num(1), num(2)))
	testParsing('(* 1 2)', app(sym('*'), num(1), num(2)))
	testParsing('(x _)', app(x, all()))
	testParsing('(x ())', app(x, unit()))
	testParsing('(x)', app(x))
	testParsing('(0 false)', app(num(1), sym('false')))
	testParsing('((true) x)', app(app(sym('true')), x))
})

describe('parsing scope', () => {
	testParsing('{x = 1 x}', scope({x: num(1)}, x))
	testParsing('{x = 1}', scope({x: num(1)}))
	testParsing('{x = {x = 1}}', scope({x: scope({x: num(1)})}))
	testParsing('{{1}}', scope({}, scope({}, num(1))))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', vec())
	testParsing('[    1   \t]', vec(num(1)))
	testParsing('[1 2 3]', vec(num(1), num(2), num(3)))
	testParsing('[1[2]3   ]', vec(num(1), vec(num(2)), num(3)))
	testParsing(
		'[(+)false(+)+]',
		vec(app(sym('+')), sym('false'), app(sym('+')), sym('+'))
	)
	testParsing('[...1]', vecFrom([], num(1)))
})

describe('parsing dictionary', () => {
	testParsing('{   a :    1 }', dict({a: num(1)}))
	testParsing('{\t"foo bar"  : 1\t}', dict({'foo bar': num(1)}))
	testParsing('{   }', dict({}))
	testParsing('{a: A b: B}', dict({a: sym('A'), b: sym('B')}))
	testParsing('{a: {a: 1}}', dict({a: dict({a: num(1)})}))
	testParsing('{{}}', scope({}, dict({})))
	testParsing('{a?: 10}', dictFrom({a: {optional: true, value: num(10)}}))
})

describe('parsing function definition', () => {
	testParsing('(=> x:Num x)', fn({x: Num}, x))
	testParsing('(=> (x:Num) x)', fn({x: Num}, x))
	testParsing('(=> (x : Num y : Bool) x)', fn({x: Num, y: Bool}, x))
	testParsing('(=>()_)', fn({}, all()))
	testParsing('(=>()())', fn({}, unit()))
	testParsing('(=> () (+ 1 2))', fn({}, app(sym('+'), num(1), num(2))))
	testParsing('(=> () (=> () 1))', fn({}, fn({}, num(1))))
})

describe('parsing function type', () => {
	testParsing('(-> Num Num)', tyFn(Num, Num))
	testParsing('(-> [Num] Num)', tyFn(vec(Num), Num))
	testParsing('(-> [...Num] Num)', tyFn(vecFrom([], Num), Num))
	testParsing('(-> _ _)', tyFn(all(), all()))
	testParsing('(-> () ())', tyFn([], unit()))
	testParsing('(-> (()) ())', tyFn([unit()], unit()))
	testParsing('(-> () z)', tyFn([], z))
	testParsing('(-> x z)', tyFn(x, z))
	testParsing('(-> (x) z)', tyFn(x, z))
	testParsing('(-> (x y) z)', tyFn([x, y], z))
	testParsing('(-> (x y z) w)', tyFn([x, y, z], w))
	testParsing('(-> [x y] z)', tyFn(vec(x, y), z))
})

function testParsing(input: string, expected: Node) {
	test(`parsing '${input}' to be ${expected.print()}`, () => {
		const result = parse(input)
		if (!isEqual(result, expected)) {
			throw new Error('Got=' + result.print())
		}
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
