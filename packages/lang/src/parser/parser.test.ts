import {
	all,
	app,
	bottom,
	eDict,
	eDictFrom,
	eFn,
	eTyFn,
	eVec,
	eVecFrom,
	isSame,
	Node,
	num,
	scope,
	str,
	sym,
	tyVar,
	unit,
} from '../exp'
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
	testParsing(' () ', unit)
	testParsing(' (  \t   ) ', unit)
	testParsing(' _ ', all)
	testParsing('_|_', bottom)
	testParsing('<T>', tyVar('T'))
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
	testParsing('(x _)', app(x, all))
	testParsing('(x ())', app(x, unit))
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
	testParsing('\t[   ]  ', eVec())
	testParsing('[    1   \t]', eVec(num(1)))
	testParsing('[1 2 3]', eVec(num(1), num(2), num(3)))
	testParsing('[1[2]3   ]', eVec(num(1), eVec(num(2)), num(3)))
	testParsing(
		'[(+)false(+)+]',
		eVec(app(sym('+')), sym('false'), app(sym('+')), sym('+'))
	)
	testParsing('[...1]', eVecFrom([], num(1)))
})

describe('parsing dictionary', () => {
	testParsing('{   a :    1 }', eDict({a: num(1)}))
	testParsing('{\t"foo bar"  : 1\t}', eDict({'foo bar': num(1)}))
	testParsing('{   }', eDict({}))
	testParsing('{a: A b: B}', eDict({a: sym('A'), b: sym('B')}))
	testParsing('{a: {a: 1}}', eDict({a: eDict({a: num(1)})}))
	testParsing('{{}}', scope({}, eDict({})))
	testParsing('{a?:1}', eDictFrom({a: {optional: true, value: num(1)}}))
	testParsing(
		'{a?:1 b:2 ...c}',
		eDictFrom(
			{a: {optional: true, value: num(1)}, b: {optional: false, value: num(2)}},
			sym('c')
		)
	)
})

describe('parsing function definition', () => {
	testParsing('(=> x:Num x)', eFn({x: Num}, x))
	testParsing('(=> (x:Num) x)', eFn({x: Num}, x))
	testParsing('(=> (x : Num y : Bool) x)', eFn({x: Num, y: Bool}, x))
	testParsing('(=>()_)', eFn({}, all))
	testParsing('(=>()())', eFn({}, unit))
	testParsing('(=> () (+ 1 2))', eFn({}, app(sym('+'), num(1), num(2))))
	testParsing('(=> () (=> () 1))', eFn({}, eFn({}, num(1))))
})

describe('parsing function type', () => {
	testParsing('(-> Num Num)', eTyFn(Num, Num))
	testParsing('(-> [Num] Num)', eTyFn(eVec(Num), Num))
	testParsing('(-> [...Num] Num)', eTyFn(eVecFrom([], Num), Num))
	testParsing('(-> _ _)', eTyFn(all, all))
	testParsing('(-> () ())', eTyFn([], unit))
	testParsing('(-> (()) ())', eTyFn([unit], unit))
	testParsing('(-> () z)', eTyFn([], z))
	testParsing('(-> x z)', eTyFn(x, z))
	testParsing('(-> (x) z)', eTyFn(x, z))
	testParsing('(-> (x y) z)', eTyFn([x, y], z))
	testParsing('(-> (x y z) w)', eTyFn([x, y, z], w))
	testParsing('(-> [x y] z)', eTyFn(eVec(x, y), z))
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
