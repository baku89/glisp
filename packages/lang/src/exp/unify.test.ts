import _ from 'lodash'

import * as Val from '../val'
import {Const, getTyVars, RangedUnifier} from './unify'

const T = Val.tyVar('T'),
	U = Val.tyVar('U')

describe('getTyVars', () => {
	run(Val.num(1), [])
	run(Val.bool(true), [])
	run(T, [T])
	run(Val.uniteTy(T, U), [T, U])
	run(Val.tyFn([Val.tyBool, T, T], U), [T, U])

	function run(ty: Val.Value, expected: Val.TyVar[]) {
		const eStr = '{' + expected.map(e => e.print()).join(', ') + '}'

		test(`FV(${ty.print()}) equals to ${eStr}`, () => {
			const tvs = [...getTyVars(ty)]
			const diff = _.differenceWith(tvs, expected, Val.isEqual)

			if (diff.length > 0) {
				fail('Got={' + tvs.map(tv => tv.print()).join(', ') + '}')
			}
		})
	}
})

describe('unifyTyVars', () => {
	run([[T, '>=', Val.tyNum]], T, Val.tyNum)
	run(
		[
			[T, '>=', Val.unit],
			[T, '>=', Val.tyNum],
		],
		T,
		Val.TyUnion.fromTypesUnsafe([Val.unit, Val.tyNum])
	)

	function run(consts: Const[], tv: Val.TyVar, expected: Val.Value) {
		const cStr = printConsts(consts)
		const tvStr = tv.print()
		const eStr = expected.print()
		const subst = RangedUnifier.unify(consts)
		const resolved = subst.substitute(tv)

		test(`Under constraints ${cStr}, σ(${tvStr}) equals to ${eStr}`, () => {
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
