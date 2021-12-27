import {
	all,
	bottom,
	False,
	num,
	str,
	True,
	tyBool,
	tyDifference,
	tyIntersection,
	tyNum,
	tyStr,
	TyUnion,
	unit,
	Value,
} from '.'
import {tyUnion} from './TypeOperation'
import {UnitableType} from './val'

const unite = (...types: UnitableType[]) => TyUnion.fromTypesUnsafe(types)

const N1 = num(1)
const N2 = num(2)
const N3 = num(3)

const S1 = str('foo')
const S2 = str('bar')

describe('uniting types', () => {
	test().toBe(bottom)
	test(bottom).toBe(bottom)
	test(all).toBe(all)
	test(unit).toBe(unit)
	test(N1).toBe(N1)
	test(N1, N2).toBe(unite(N1, N2))
	test(S1, S2).toBe(unite(S1, S2))
	test(N1, N2, S1).toBe(unite(N1, N2, S1))
	test(S1, tyStr).toBe(tyStr)
	test(unite(N1, N2), unite(N2, N3)).toBe(unite(N1, N2, N3))
	test(unite(N1, N2), tyNum).toBe(tyNum)
	test(tyNum, unite(N1, N2)).toBe(tyNum)
	test(tyNum, tyBool).toBe(unite(tyNum, tyBool))
	test(tyNum, bottom).toBe(tyNum)
	test(bottom, bottom).toBe(bottom)
	test(bottom, all).toBe(all)
	test(True, False).toBe(tyBool)
	test(tyBool, True, False).toBe(tyBool)
	test(True, False).toBe(tyBool)
	test(N2, unit).toBe(unite(N2, unit))

	function test(...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.toAst().print()).join(', ')
			const expectedStr = expected.toAst().print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = tyUnion(...orderedTypes)
					if (!result.isEqualTo(expected)) {
						throwError(result, orderedTypes)
					}
				}
			})
		}

		return {toBe: f}
	}
})

describe('intersecting types', () => {
	test().toBe(all)
	test(bottom).toBe(bottom)
	test(unite(N1, N2), unite(N2, N3)).toBe(N2)
	test(N1, N2).toBe(bottom)
	test(unite(N1, N2), unite(S1, S2)).toBe(bottom)
	test(unite(N1, N2), unite(N1, N2)).toBe(unite(N1, N2))
	test(N1, tyNum).toBe(N1)
	test(unite(N1, False), N1).toBe(N1)
	test(unite(tyNum, False), unite(N1, N2, tyBool)).toBe(unite(N1, N2, False))

	function test(...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.toAst().print()).join(', ')
			const expectedStr = expected.toAst().print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = tyIntersection(...orderedTypes)
					if (!result.isEqualTo(expected)) {
						throwError(result, orderedTypes)
					}
				}
			})
		}

		return {toBe: f}
	}
})

describe('differential types', () => {
	// X = X
	test(all).toBe(all)
	test(bottom).toBe(bottom)
	test(unit).toBe(unit)

	// A - A = _|_
	test(all, all).toBe(bottom)
	test(bottom, bottom).toBe(bottom)
	test(N1, N1).toBe(bottom)
	test(S1, S1).toBe(bottom)
	test(True, True).toBe(bottom)
	test(tyNum, tyNum).toBe(bottom)
	test(tyStr, tyStr).toBe(bottom)
	test(tyBool, tyBool).toBe(bottom)
	test(unite(N1, N2), unite(N1, N2)).toBe(bottom)

	// T - S = T
	test(all, N1).toBe(all)
	test(tyNum, N1).toBe(tyNum)
	test(all, N1).toBe(all)

	// Enum substraction
	test(tyBool, True).toBe(False)
	test(tyBool, True, False).toBe(bottom)
	test(unite(tyBool, N1), True).toBe(unite(N1, False))
	test(unite(tyBool, N1), True, N1).toBe(False)

	function test(original: Value, ...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.toAst().print()).join(', ')
			const expectedStr = expected.toAst().print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = tyDifference(original, ...orderedTypes)
					if (!result.isEqualTo(expected)) {
						throwError(result, orderedTypes)
					}
				}
			})
		}

		return {toBe: f}
	}
})

function permutation<T>(inputArr: T[]) {
	const result: T[][] = []

	const permute = (arr: T[], m: T[] = []) => {
		if (arr.length === 0) {
			result.push(m)
		} else {
			for (let i = 0; i < arr.length; i++) {
				const curr = arr.slice()
				const next = curr.splice(i, 1)
				permute(curr.slice(), m.concat(next))
			}
		}
	}

	permute(inputArr)

	return result
}

function throwError(result: Value, orderedTypes: Value[]): never {
	const v = result.toAst().print()
	const ord = orderedTypes.map(o => o.toAst().print()).join(', ')
	throw new Error(`Got '${v}' in order '${ord}'`)
}
