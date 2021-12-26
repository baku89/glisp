import _ from 'lodash'

import * as Exp from '.'
import {Const, getTyVars, RangedUnifier} from './unify'

const T = Exp.tyVar('T'),
	U = Exp.tyVar('U')

describe('getTyVars', () => {
	run(Exp.num(1), [])
	run(Exp.bool(true), [])
	run(T, [T])
	run(Exp.tyUnion(T, U), [T, U])
	run(Exp.tyFn([Exp.tyBool, T, T], U), [T, U])

	function run(ty: Exp.Value, expected: Exp.TyVar[]) {
		const eStr = '{' + expected.map(e => e.toAst().print()).join(', ') + '}'

		test(`FV(${ty.toAst().print()}) equals to ${eStr}`, () => {
			const tvs = [...getTyVars(ty)]
			const diff = _.differenceWith(tvs, expected, Exp.isEqual)

			if (diff.length > 0) {
				fail('Got={' + tvs.map(t => t.toAst().print()).join(', ') + '}')
			}
		})
	}
})

describe('unifyTyVars', () => {
	test([[T, '>=', Exp.tyNum]], T, Exp.tyNum)
	test(
		[
			[T, '>=', Exp.unit],
			[T, '>=', Exp.tyNum],
		],
		T,
		Exp.TyUnion.fromTypesUnsafe([Exp.unit, Exp.tyNum])
	)

	function test(consts: Const[], tv: Exp.TyVar, expected: Exp.Value) {
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
