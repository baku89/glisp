import {
	app,
	fn,
	int,
	isEqual,
	Node,
	obj,
	scope,
	sym,
	tyFn,
	vec,
	vecV,
} from '../exp'
import {all, bottom} from '../val'
import {parse} from '.'

const Int = sym('Int')
const Bool = sym('Bool')
const x = sym('x')
const y = sym('y')
const z = sym('z')
const w = sym('w')

describe('parsing literals', () => {
	testParsing('10', int(10))
	testParsing('   10   ', int(10))
	testParsing('   \t 5 \r\n', int(5))
	testParsing('false', sym('false'))
	testParsing('true', sym('true'))
	testParsing(' () ', obj(bottom))
	testParsing(' (  \t   ) ', obj(bottom))
	testParsing(' _ ', obj(all))
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

	function run(input: string, expected: string) {
		testParsing(input, sym(expected))
	}
})

describe('parsing call expressions', () => {
	testParsing('(+ 1 2)', app(sym('+'), int(1), int(2)))
	testParsing('(* 1 2)', app(sym('*'), int(1), int(2)))
	testParsing('(x _)', app(x, obj(all)))
	testParsing('(x ())', app(x, obj(bottom)))
	testParsing('(x)', app(x))
	testParsing('(0 false)', app(int(1), sym('false')))
	testParsing('((true) x)', app(app(sym('true')), x))
})

describe('parsing scope', () => {
	testParsing('{x = 1 x}', scope({x: int(1)}, x))
	testParsing('{x = 1}', scope({x: int(1)}))
	testParsing('{x = {x = 1}}', scope({x: scope({x: int(1)})}))
	testParsing('{{1}}', scope({}, scope({}, int(1))))
})

describe('parsing vector', () => {
	testParsing('\t[   ]  ', vec())
	testParsing('[    1   \t]', vec(int(1)))
	testParsing('[1 2 3]', vec(int(1), int(2), int(3)))
	testParsing('[1[2]3   ]', vec(int(1), vec(int(2)), int(3)))
	testParsing(
		'[(+)false(+)+]',
		vec(app(sym('+')), sym('false'), app(sym('+')), sym('+'))
	)
	testParsing('[...1]', vecV(int(1)))
})

describe('parsing function definition', () => {
	testParsing('(=> x:Int x)', fn({x: Int}, x))
	testParsing('(=> (x:Int) x)', fn({x: Int}, x))
	testParsing('(=> (x : Int y : Bool) x)', fn({x: Int, y: Bool}, x))
	testParsing('(=>()_)', fn({}, obj(all)))
	testParsing('(=>()())', fn({}, obj(bottom)))
	testParsing('(=> () (+ 1 2))', fn({}, app(sym('+'), int(1), int(2))))
	testParsing('(=> () (=> () 1))', fn({}, fn({}, int(1))))
})

describe('parsing function type', () => {
	testParsing('(-> Int Int)', tyFn(Int, Int))
	testParsing('(-> [Int] Int)', tyFn(vec(Int), Int))
	testParsing('(-> [...Int] Int)', tyFn(vecV(Int), Int))
	testParsing('(-> _ _)', tyFn(obj(all), obj(all)))
	testParsing('(-> () ())', tyFn([], obj(bottom)))
	testParsing('(-> (()) ())', tyFn([obj(bottom)], obj(bottom)))
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
