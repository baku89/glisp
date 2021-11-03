import * as Val from '../val'
import {applySubst, Subst} from './unify'

describe('applySubst', () => {
	const T = Val.tyVar()
	const U = Val.tyVar()

	run(T, [T, Val.tyInt], Val.tyInt)
	run(T, [T, U], U)
	run(Val.tyFn([T], T), [T, Val.tyInt], Val.tyFn([Val.tyInt], Val.tyInt))
	run(Val.tyFn([T], Val.tyFn([T], T)), [T, U], Val.tyFn([U], Val.tyFn([U], U)))

	function run(val: Val.Value, subst: Subst, expected: Val.Value) {
		test(printSubsts(subst) + val.print() + ' := ' + expected.print(), () => {
			const substituted = applySubst(val, subst)

			if (!substituted.isEqualTo(expected)) {
				fail(`Got=${substituted}`)
			}
		})
	}

	function printSubsts(...substs: Subst[]) {
		const strs = substs.map(([s, t]) => s.print() + ' |-> ' + t.print())
		return '[' + strs.join(', ') + ']'
	}
})
