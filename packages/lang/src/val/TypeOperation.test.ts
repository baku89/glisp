import {
	all,
	BoolType,
	differenceType,
	False,
	intersectionType,
	never,
	num,
	NumType,
	str,
	StrType,
	True,
	UnionType,
	unit,
	Value,
} from '.'
import {unionType} from './TypeOperation'
import {UnitableType} from './val'

const unite = (...types: UnitableType[]) => UnionType.fromTypesUnsafe(types)

const N1 = num(1)
const N2 = num(2)
const N3 = num(3)

const S1 = str('foo')
const S2 = str('bar')

describe('uniting types', () => {
	test().toBe(never)
	test(never).toBe(never)
	test(all).toBe(all)
	test(unit).toBe(unit)
	test(N1).toBe(N1)
	test(N1, N2).toBe(unite(N1, N2))
	test(S1, S2).toBe(unite(S1, S2))
	test(N1, N2, S1).toBe(unite(N1, N2, S1))
	test(S1, StrType).toBe(StrType)
	test(unite(N1, N2), unite(N2, N3)).toBe(unite(N1, N2, N3))
	test(unite(N1, N2), NumType).toBe(NumType)
	test(NumType, unite(N1, N2)).toBe(NumType)
	test(NumType, BoolType).toBe(unite(NumType, BoolType))
	test(NumType, never).toBe(NumType)
	test(never, never).toBe(never)
	test(never, all).toBe(all)
	test(True, False).toBe(BoolType)
	test(BoolType, True, False).toBe(BoolType)
	test(True, False).toBe(BoolType)
	test(N2, unit).toBe(unite(N2, unit))

	function test(...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.print()).join(', ')
			const expectedStr = expected.print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = unionType(...orderedTypes)
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
	test(never).toBe(never)
	test(unite(N1, N2), unite(N2, N3)).toBe(N2)
	test(N1, N2).toBe(never)
	test(unite(N1, N2), unite(S1, S2)).toBe(never)
	test(unite(N1, N2), unite(N1, N2)).toBe(unite(N1, N2))
	test(N1, NumType).toBe(N1)
	test(unite(N1, False), N1).toBe(N1)
	test(unite(NumType, False), unite(N1, N2, BoolType)).toBe(
		unite(N1, N2, False)
	)

	function test(...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.print()).join(', ')
			const expectedStr = expected.print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = intersectionType(...orderedTypes)
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
	test(never).toBe(never)
	test(unit).toBe(unit)

	// A - A = Never
	test(all, all).toBe(never)
	test(never, never).toBe(never)
	test(N1, N1).toBe(never)
	test(S1, S1).toBe(never)
	test(True, True).toBe(never)
	test(NumType, NumType).toBe(never)
	test(StrType, StrType).toBe(never)
	test(BoolType, BoolType).toBe(never)
	test(unite(N1, N2), unite(N1, N2)).toBe(never)

	// T - S = T
	test(all, N1).toBe(all)
	test(NumType, N1).toBe(NumType)
	test(all, N1).toBe(all)

	// Enum substraction
	test(BoolType, True).toBe(False)
	test(BoolType, True, False).toBe(never)
	test(unite(BoolType, N1), True).toBe(unite(N1, False))
	test(unite(BoolType, N1), True, N1).toBe(False)

	function test(original: Value, ...types: Value[]) {
		const f = (expected: Value) => {
			const typesStr = types.map(t => t.print()).join(', ')
			const expectedStr = expected.print()
			it(`'${typesStr}' to be '${expectedStr}'`, () => {
				for (const orderedTypes of permutation(types)) {
					const result = differenceType(original, ...orderedTypes)
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
	const v = result.print()
	const ord = orderedTypes.map(o => o.print()).join(', ')
	throw new Error(`Got '${v}' in order '${ord}'`)
}
