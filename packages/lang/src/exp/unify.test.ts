import _ from 'lodash'

import * as Val from '../val'
import {Const, getTyVars, unify} from './unify'

describe('getTyVars', () => {
	const T = Val.tyVar(),
		U = Val.tyVar()

	run(Val.int(1), [])
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

describe('resolveLowerConsts', () => {
	const T = Val.tyVar(),
		U = Val.tyVar()

	run(T, [[Val.tyInt, T]], Val.tyInt)
	run(
		T,
		[
			[Val.tyInt, U],
			[U, T],
		],
		Val.tyInt
	)
	run(
		T,
		[
			[U, T],
			[Val.tyInt, U],
		],
		Val.tyInt
	)
	run(
		T,
		[
			[Val.int(1), T],
			[Val.int(2), T],
		],
		Val.uniteTy(Val.int(1), Val.int(2))
	)

	function run(tv: Val.TyVar, consts: Const[], expected: Val.Value) {
		const tvStr = tv.print()
		const cStr = printConsts(consts)
		const eStr = expected.print()

		test(`${tvStr} in ${cStr} equals to ${eStr}`, () => {
			const subst = unify(consts)
			const resolved = subst.applyTo(tv)
			if (!resolved.isEqualTo(expected)) {
				throw new Error('Got=' + resolved.print())
			}
		})
	}
})

function printConsts(consts: Const[]) {
	const strs = consts.map(([a, b]) => a.print() + ' <: ' + b.print())
	return '{' + strs.join(', ') + '}'
}
