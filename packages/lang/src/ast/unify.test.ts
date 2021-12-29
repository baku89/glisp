import _ from 'lodash'

import * as Val from '../val'
import {Const, getTyVars, Unifier} from './unify'

const T = Val.tyVar('T'),
	U = Val.tyVar('U'),
	T1 = Val.tyVar('T1'),
	T2 = Val.tyVar('T2'),
	T3 = Val.tyVar('T3'),
	T4 = Val.tyVar('T4'),
	T5 = Val.tyVar('T5')

describe('getTyVars', () => {
	run(Val.num(1), [])
	run(Val.bool(true), [])
	run(T, [T])
	run(Val.tyUnion(T, U), [T, U])
	run(Val.tyFn([Val.tyBool, T, T], U), [T, U])

	function run(ty: Val.Value, expected: Val.TyVar[]) {
		const eStr = '{' + expected.map(e => e.print()).join(', ') + '}'

		test(`FV(${ty.print()}) equals to ${eStr}`, () => {
			const tvs = [...getTyVars(ty)]
			const diff = _.differenceWith(tvs, expected, Val.isEqual)

			if (diff.length > 0) {
				fail('Got={' + tvs.map(t => t.print()).join(', ') + '}')
			}
		})
	}
})

describe('unifyTyVars', () => {
	test([[T, '>=', Val.tyNum]], T, Val.tyNum)
	test(
		[
			[T, '>=', Val.unit],
			[T, '>=', Val.tyNum],
		],
		T,
		Val.TyUnion.fromTypesUnsafe([Val.unit, Val.tyNum])
	)
	test([[Val.tyNum, '>=', T]], T, Val.tyNum)
	test(
		[
			[T, '>=', Val.unit],
			[T, '>=', Val.tyNum],
		],
		T,
		Val.TyUnion.fromTypesUnsafe([Val.unit, Val.tyNum])
	)
	test(
		[[Val.tyFn(Val.tyFn(T1, T2), T3), '==', Val.tyFn(T4, T5)]],
		T4,
		Val.tyFn(T1, T2)
	)
	test(
		[[Val.tyFn(T1, T2), '==', Val.tyFn(T3, Val.tyFn(T4, T5))]],
		T2,
		Val.tyFn(T4, T5)
	)

	function test(consts: Const[], tv: Val.TyVar, expected: Val.Value) {
		const cStr = printConsts(consts)
		const tvStr = tv.print()
		const eStr = expected.print()
		const unifier = new Unifier(...consts)
		const resolved = unifier.substitute(tv)

		it(`Under constraints ${cStr}, σ(${tvStr}) equals to ${eStr}`, () => {
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
