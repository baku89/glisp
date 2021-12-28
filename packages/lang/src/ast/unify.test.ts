import _ from 'lodash'

import * as Val from '../val'
import {Const, getTyVars, RangedUnifier} from './unify'

const T = Val.tyVar('T'),
	U = Val.tyVar('U')

describe('getTyVars', () => {
	run(Val.num(1), [])
	run(Val.bool(true), [])
	run(T, [T])
	run(Val.tyUnion(T, U), [T, U])
	run(Val.tyFn([Val.tyBool, T, T], U), [T, U])

	function run(ty: Val.Value, expected: Val.TyVar[]) {
		const eStr = '{' + expected.map(e => e.toAst().print()).join(', ') + '}'

		test(`FV(${ty.toAst().print()}) equals to ${eStr}`, () => {
			const tvs = [...getTyVars(ty)]
			const diff = _.differenceWith(tvs, expected, Val.isEqual)

			if (diff.length > 0) {
				fail('Got={' + tvs.map(t => t.toAst().print()).join(', ') + '}')
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

	function test(consts: Const[], tv: Val.TyVar, expected: Val.Value) {
		const cStr = printConsts(consts)
		const tvStr = tv.toAst().print()
		const eStr = expected.toAst().print()
		const subst = RangedUnifier.unify(...consts)
		const resolved = subst.substitute(tv)

		it(`Under constraints ${cStr}, σ(${tvStr}) equals to ${eStr}`, () => {
			if (!resolved.isEqualTo(expected)) {
				throw new Error('Got=' + resolved.toAst().print())
			}
		})
	}

	function printConsts(consts: Const[]) {
		const strs = consts
			.map(([s, R, t]) => [s.toAst().print(), R, t.toAst().print()].join(' '))
			.join(', ')

		return '{' + strs + '}'
	}
})