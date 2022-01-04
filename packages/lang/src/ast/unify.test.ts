import _, {fromPairs} from 'lodash'

import * as Val from '../val'
import {Const, getTypeVars, Unifier} from './unify'

const T = Val.typeVar('T'),
	U = Val.typeVar('U'),
	T1 = Val.typeVar('T1'),
	T2 = Val.typeVar('T2'),
	T3 = Val.typeVar('T3'),
	T4 = Val.typeVar('T4'),
	T5 = Val.typeVar('T5')

function ft(param: Val.Value | Val.Value[], out: Val.Value) {
	const _param = Array.isArray(param)
		? fromPairs(param.map((p, i) => [i, p]))
		: {0: param}
	return Val.fnType({param: _param, out})
}

describe('getTypeVars', () => {
	run(Val.num(1), [])
	run(Val.bool(true), [])
	run(T, [T])
	run(Val.unionType(T, U), [T, U])
	run(ft([Val.BoolType, T, T], U), [T, U])

	function run(ty: Val.Value, expected: Val.TypeVar[]) {
		const eStr = '{' + expected.map(e => e.print()).join(', ') + '}'

		test(`FV(${ty.print()}) equals to ${eStr}`, () => {
			const tvs = [...getTypeVars(ty)]
			const diff = _.differenceWith(tvs, expected, Val.isEqual)

			if (diff.length > 0) {
				fail('Got={' + tvs.map(t => t.print()).join(', ') + '}')
			}
		})
	}
})

describe('unifyTypeVars', () => {
	test([[T, '>=', Val.NumType]], T, Val.NumType)
	test(
		[
			[T, '>=', Val.unit],
			[T, '>=', Val.NumType],
		],
		T,
		Val.UnionType.fromTypesUnsafe([Val.unit, Val.NumType])
	)
	test([[Val.NumType, '>=', T]], T, Val.NumType)
	test(
		[
			[T, '>=', Val.unit],
			[T, '>=', Val.NumType],
		],
		T,
		Val.UnionType.fromTypesUnsafe([Val.unit, Val.NumType])
	)
	test([[ft(ft(T1, T2), T3), '==', ft(T4, T5)]], T4, ft(T1, T2))
	test([[ft(T1, T2), '==', ft(T3, ft(T4, T5))]], T2, ft(T4, T5))
	test([[ft(T, U), '>=', ft(Val.NumType, Val.NumType)]], T, Val.NumType)
	test(
		[
			[ft(T1, T2), '>=', ft(Val.NumType, Val.NumType)],
			[ft(T2, T3), '>=', ft(Val.NumType, Val.BoolType)],
		],
		ft(T1, T3),
		ft(Val.NumType, Val.BoolType)
	)

	function test(consts: Const[], original: Val.Value, expected: Val.Value) {
		const cStr = printConsts(consts)
		const oStr = original.print()
		const eStr = expected.print()
		const unifier = new Unifier(...consts)
		const resolved = unifier.substitute(original)

		it(`Under constraints ${cStr}, σ(${oStr}) equals to ${eStr}`, () => {
			if (!resolved.isEqualTo(expected)) {
				throw new Error('Got=' + resolved.print())
			}
		})
	}

	function printConsts(consts: Const[]) {
		const strs = consts
			.map(([s, R, t]) => [s.print(), R, t.print()].join(' '))
			.join(', ')

		return '{' + strs + '}'
	}
})
