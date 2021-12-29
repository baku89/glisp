import {createUniqueName} from './NameCollision'

test('creating name collision', () => {
	const names = ['A', 'B1', 'C', 'C1', 'C2', 'D', 'D2', 'E001']

	expect(createUniqueName('X', names)).toBe('X')
	expect(createUniqueName('A', names)).toBe('A1')
	expect(createUniqueName('B1', names)).toBe('B2')
	expect(createUniqueName('B001', names)).toBe('B001') // Ideally, B2
	expect(createUniqueName('C', names)).toBe('C3')
	expect(createUniqueName('D', names)).toBe('D1')
	expect(createUniqueName('E0001', names)).toBe('E0001') // Ideally, E2
})
