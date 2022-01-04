import {
	all,
	call,
	dict,
	dictFrom,
	fn,
	fnTypeFrom,
	id,
	isSame,
	never,
	Node,
	num,
	scope,
	str,
	unit,
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
	testParsing(' () ', unit())
	testParsing(' (  \t   ) ', unit())
	testParsing(' _ ', all())
	testParsing('Never', never())
})

describe('parsing symbols', () => {
	run('foo', 'foo')
	run('BAR', 'BAR')
	run('true1', 'true1')
	run('abc123 ', 'abc123')
	run('+-*/&|<=>_', '+-*/&|<=>_')
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
	testParsing('(x ())', call(x, unit()))
	testParsing('(x)', call(x))
	testParsing('(0 false)', call(num(1), id('false')))
	testParsing('((true) x)', call(call(id('true')), x))
})

describe('parsing scope', () => {
	testParsing('(let x = 1 x)', scope({x: num(1)}, x))
	testParsing('(let x = 1)', scope({x: num(1)}))
	testParsing('(let x = (let x = 1))', scope({x: scope({x: num(1)})}))
	testParsing('(let (let 1))', scope({}, scope({}, num(1))))
	testParsing('(let)', scope({}))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', vec())
	testParsing('[    1   \t]', vec([num(1)]))
	testParsing('[1 2 3]', vec([num(1), num(2), num(3)]))
	testParsing('[1[2]3   ]', vec([num(1), vec([num(2)]), num(3)]))
	testParsing(
		'[(+)false(+)+]',
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
	testParsing('{a?:1}', dictFrom({a: num(1)}, ['a']))
	testParsing(
		'{a?:1 b:2 ...c}',
		dictFrom(
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
	testParsing('(=> [x:Num] x)', fn([], {x: Num}, x))
	testParsing('(=> [x : Num y : Bool] x)', fn([], {x: Num, y: Bool}, x))
	testParsing('(=>[]_)', fn([], {}, all()))
	testParsing('(=>[]())', fn([], {}, unit()))
	testParsing('(=> [] (+ 1 2))', fn([], {}, call(id('+'), num(1), num(2))))
	testParsing('(=> [] (=> [] 1))', fn([], {}, fn([], {}, num(1))))
	testParsing('(=> <T> [x:T] x)', fn(['T'], {x: id('T')}, x))
	testParsing('(=> <T U> [x:T] x)', fn(['T', 'U'], {x: id('T')}, x))
	testParsing('(=> <> [] Num)', fn([], {}, Num))
	testErrorParsing('(=> <1> [] Num)')
})

describe('parsing function type', () => {
	testParsing('(-> [[...x]] x)', fnTypeFrom([], {0: vec([], 0, x)}, x))
	testParsing('(-> [_] _)', fnTypeFrom([], {0: all()}, all()))
	testParsing('(-> [[]] ())', fnTypeFrom([], {0: vec()}, unit()))
	testParsing('(-> [] z)', fnTypeFrom([], {}, z))
	testParsing('(-> [] [])', fnTypeFrom([], {}, vec()))
	testParsing('(-> [x] z)', fnTypeFrom([], {0: x}, z))
	testParsing('(-> [x y] z)', fnTypeFrom([], {0: x, 1: y}, z))
	testParsing('(-> [x y z] w)', fnTypeFrom([], {0: x, 1: y, 2: z}, w))
	testParsing('(-> [[x y]] z)', fnTypeFrom([], {0: vec([x, y])}, z))
	testParsing('(-> [x:x] z)', fnTypeFrom([], {x}, z))
	testParsing('(-> [x:x y] z)', fnTypeFrom([], {x, 1: y}, z))
	testParsing('(-> <T> [x:T] T)', fnTypeFrom(['T'], {x: id('T')}, id('T')))
	testParsing(
		'(-> <T U> [x:T] T)',
		fnTypeFrom(['T', 'U'], {x: id('T')}, id('T'))
	)
	testErrorParsing('(-> <> [] Num)')
	testErrorParsing('(-> <1> [] Num)')
})

function testParsing(input: string, expected: Node) {
	test(`parsing '${input}' to be ${expected.print()}`, () => {
		const result = parse(input)
		if (!isSame(result, expected)) {
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
