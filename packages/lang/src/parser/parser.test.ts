import {
	call,
	eDict,
	eDictFrom,
	eFn,
	eTyFnFrom,
	eVec,
	eVecFrom,
	isSame,
	lAll,
	lBottom,
	lNum,
	lStr,
	lUnit,
	Node,
	scope,
	sym,
} from '../ast'
import {parse} from '.'

const Num = sym('Num')
const Bool = sym('Bool')
const x = sym('x')
const y = sym('y')
const z = sym('z')
const w = sym('w')

describe('parsing literals', () => {
	testParsing('10', lNum(10))
	testParsing('   10   ', lNum(10))
	testParsing('   \t 5 \r\n', lNum(5))
	testParsing('false', sym('false'))
	testParsing('true', sym('true'))
	testParsing('"hello"', lStr('hello'))
	testParsing('"hello, world"', lStr('hello, world'))
	testParsing(' () ', lUnit())
	testParsing(' (  \t   ) ', lUnit())
	testParsing(' _ ', lAll())
	testParsing('_|_', lBottom())
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
			testParsing(input, sym(expected))
		} else {
			testErrorParsing(input)
		}
	}
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', call(sym('+'), lNum(1), lNum(2)))
	testParsing('(* 1 2)', call(sym('*'), lNum(1), lNum(2)))
	testParsing('(x _)', call(x, lAll()))
	testParsing('(x ())', call(x, lUnit()))
	testParsing('(x)', call(x))
	testParsing('(0 false)', call(lNum(1), sym('false')))
	testParsing('((true) x)', call(call(sym('true')), x))
})

describe('parsing scope', () => {
	testParsing('(let x = 1 x)', scope({x: lNum(1)}, x))
	testParsing('(let x = 1)', scope({x: lNum(1)}))
	testParsing('(let x = (let x = 1))', scope({x: scope({x: lNum(1)})}))
	testParsing('(let (let 1))', scope({}, scope({}, lNum(1))))
	testParsing('(let)', scope({}))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', eVec())
	testParsing('[    1   \t]', eVec(lNum(1)))
	testParsing('[1 2 3]', eVec(lNum(1), lNum(2), lNum(3)))
	testParsing('[1[2]3   ]', eVec(lNum(1), eVec(lNum(2)), lNum(3)))
	testParsing(
		'[(+)false(+)+]',
		eVec(call(sym('+')), sym('false'), call(sym('+')), sym('+'))
	)
	testParsing('[...1]', eVecFrom([], 0, lNum(1)))
	testParsing('[1?]', eVecFrom([lNum(1)], 0))
	testParsing('[1? ...2]', eVecFrom([lNum(1)], 0, lNum(2)))
	testParsing('[1 2?]', eVecFrom([lNum(1), lNum(2)], 1))
	testParsing(
		'[1 2? 3? ...4]',
		eVecFrom([lNum(1), lNum(2), lNum(3)], 1, lNum(4))
	)
})

describe('parsing dictionary', () => {
	testParsing('{   a:    1 }', eDict({a: lNum(1)}))
	testParsing('{\t"foo bar": 1\t}', eDict({'foo bar': lNum(1)}))
	testParsing('{   }', eDict({}))
	testParsing('{a: A b: B}', eDict({a: sym('A'), b: sym('B')}))
	testParsing('{a: {a: 1}}', eDict({a: eDict({a: lNum(1)})}))
	testParsing('{a?:1}', eDictFrom({a: lNum(1)}, ['a']))
	testParsing(
		'{a?:1 b:2 ...c}',
		eDictFrom(
			{
				a: lNum(1),
				b: lNum(2),
			},
			['a'],
			sym('c')
		)
	)
})

describe('parsing function definition', () => {
	testParsing('(=> [x:Num] x)', eFn([], {x: Num}, x))
	testParsing('(=> [x : Num y : Bool] x)', eFn([], {x: Num, y: Bool}, x))
	testParsing('(=>[]_)', eFn([], {}, lAll()))
	testParsing('(=>[]())', eFn([], {}, lUnit()))
	testParsing('(=> [] (+ 1 2))', eFn([], {}, call(sym('+'), lNum(1), lNum(2))))
	testParsing('(=> [] (=> [] 1))', eFn([], {}, eFn([], {}, lNum(1))))
	testParsing('(=> <T> [x:T] x)', eFn(['T'], {x: sym('T')}, x))
	testParsing('(=> <T U> [x:T] x)', eFn(['T', 'U'], {x: sym('T')}, x))
	testParsing('(=> <> [] Num)', eFn([], {}, Num))
	testErrorParsing('(=> <1> [] Num)')
})

describe('parsing function type', () => {
	testParsing('(-> [[...x]] x)', eTyFnFrom([], {0: eVecFrom([], 0, x)}, x))
	testParsing('(-> [_] _)', eTyFnFrom([], {0: lAll()}, lAll()))
	testParsing('(-> [[]] ())', eTyFnFrom([], {0: eVec()}, lUnit()))
	testParsing('(-> [] z)', eTyFnFrom([], {}, z))
	testParsing('(-> [] [])', eTyFnFrom([], {}, eVec()))
	testParsing('(-> [x] z)', eTyFnFrom([], {0: x}, z))
	testParsing('(-> [x y] z)', eTyFnFrom([], {0: x, 1: y}, z))
	testParsing('(-> [x y z] w)', eTyFnFrom([], {0: x, 1: y, 2: z}, w))
	testParsing('(-> [[x y]] z)', eTyFnFrom([], {0: eVec(x, y)}, z))
	testParsing('(-> [x:x] z)', eTyFnFrom([], {x}, z))
	testParsing('(-> [x:x y] z)', eTyFnFrom([], {x, 1: y}, z))
	testParsing('(-> <T> [x:T] T)', eTyFnFrom(['T'], {x: sym('T')}, sym('T')))
	testParsing(
		'(-> <T U> [x:T] T)',
		eTyFnFrom(['T', 'U'], {x: sym('T')}, sym('T'))
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
