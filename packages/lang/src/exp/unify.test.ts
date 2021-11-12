import _ from 'lodash'

import * as Val from '../val'
import {getTyVars} from './unify'

describe('getTyVars', () => {
	const T = Val.tyVar('T'),
		U = Val.tyVar('U')

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
