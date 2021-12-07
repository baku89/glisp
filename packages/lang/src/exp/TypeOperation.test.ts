import {xorWith} from 'lodash'

import {parse} from '../utils/testUtils2'
import {
	all,
	bool,
	bottom,
	isEqual,
	num,
	print,
	tyBool,
	tyNum,
	TyUnion,
	Value,
} from '.'
import {tyIntersection, tyUnion} from './TypeOperation'

function parseTypes(types: string) {
	return types.split(' ').map(e => parse(e).eval2().result)
}

function asUnion(ty: Value): Value[] {
	return ty.type === 'tyUnion' ? ty.types : [ty]
}

describe('uniting types', () => {
	test('1', '1')
	test('1 2', '1 2')
	test('1 Num2', 'Num2')
	test('Num2 1', 'Num2')

	// test([num(1)], num(1))
	// test([num(1), num(2)], [num(1), num(2)])
	// test([num(1), tyNum], tyNum)
	// test([tyNum, num(1)], tyNum)
	// test([tyNum, tyBool], [tyNum, tyBool])
	// test([tyNum, all], all)
	// test([], bottom)
	// test([bottom, bottom], bottom)
	// test([bottom, all], all)
	// test([bool(true), bool(false)], tyBool)
	// test([tyBool, unite([tyNum, tyBool]), tyNum], [tyNum, tyBool])
	// test([tyNum, unit], [tyNum, unit])

	function test(input: string, expected: string) {
		it(`(| ${input}) to be (| ${expected})`, () => {
			const types = parseTypes(input)
			const result = tyUnion(...types)

			const expectedTypes = parseTypes(input)
			const surplusTypes = xorWith(asUnion(result), expectedTypes, isEqual)

			if (surplusTypes.length > 0) {
				throw new Error(
					'Got=' +
						result.print() +
						', Surplus types=' +
						surplusTypes.map(print).join(',')
				)
			}
		})
	}
})

describe('intesecting type', () => {
	test([], all)
	test([num(1)], num(1))
	test([num(1), num(2)], bottom)
	test([tyNum, num(1), num(1)], num(1))
	test([TyUnion.fromTypesUnsafe([tyNum, bool(false)]), tyNum], tyNum)
	test(
		[
			TyUnion.fromTypesUnsafe([tyNum, bool(false)]),
			TyUnion.fromTypesUnsafe([num(1), num(2), tyBool]),
		],
		TyUnion.fromTypesUnsafe([num(1), num(2), bool(false)])
	)

	function test(types: Value[], expected: Value) {
		const testStr = types.map(print).join(' ')
		const expectedStr = expected.print()

		it(`(& ${testStr}) to be ${expectedStr}`, () => {
			const result = tyIntersection(...types)
			if (!result.isEqualTo(expected)) {
				throw new Error('Got=' + result.print())
			}
		})
	}
})
