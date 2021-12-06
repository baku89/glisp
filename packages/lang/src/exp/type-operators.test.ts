import {all, bool, bottom, num, tyBool, tyNum, TyUnion, unit, Value} from '.'
import {UnitableType} from './exp'
import {intersectTy, uniteTy} from './type-operators'

describe('uniting types', () => {
	const unite = TyUnion.fromTypesUnsafe

	run([num(1)], num(1))
	run([num(1), num(2)], [num(1), num(2)])
	run([num(1), tyNum], tyNum)
	run([tyNum, num(1)], tyNum)
	run([tyNum, tyBool], [tyNum, tyBool])
	run([tyNum, all], all)
	run([], bottom)
	run([bottom, bottom], bottom)
	run([bottom, all], all)
	run([bool(true), bool(false)], tyBool)
	run([tyBool, unite([tyNum, tyBool]), tyNum], [tyNum, tyBool])
	run([tyNum, unit], [tyNum, unit])

	function run(types: Value[], expected: Value | UnitableType[]) {
		const testStr = types.map(t => t.print()).join(' ')

		const expectedTy = Array.isArray(expected) ? unite(expected) : expected

		const expectedStr = expectedTy.print()
		const united = uniteTy(...types)

		test(`(| ${testStr}) to be ${expectedStr}`, () => {
			if (!united.isEqualTo(expectedTy)) {
				throw new Error('Got=' + united.print())
			}
		})
	}
})

describe('intesecting type', () => {
	run([], all)
	run([num(1)], num(1))
	run([num(1), num(2)], bottom)
	run([tyNum, num(1), num(1)], num(1))
	run([TyUnion.fromTypesUnsafe([tyNum, bool(false)]), tyNum], tyNum)
	run(
		[
			TyUnion.fromTypesUnsafe([tyNum, bool(false)]),
			TyUnion.fromTypesUnsafe([num(1), num(2), tyBool]),
		],
		TyUnion.fromTypesUnsafe([num(1), num(2), bool(false)])
	)

	function run(types: Value[], expected: Value) {
		const testStr = types.map(t => t.print()).join(' ')
		const expectedStr = expected.print()
		const result = intersectTy(...types)

		test(`(& ${testStr}) to be ${expectedStr}`, () => {
			if (!result.isEqualTo(expected)) {
				throw new Error('Got=' + result.print())
			}
		})
	}
})
