/**
 * What `random` gives is worked out from what it is asked, and from nothing else: no clock, no
 * state, and no generator of the machine's. So it uses whole-number operations alone, which
 * come out the same on any machine.
 *
 * What it gives is part of what a program means, as a drawing depends on it. Changing how it is
 * worked out changes everyone's drawings, which is what the pinned values in its tests hold to.
 */

const BITS = new DataView(new ArrayBuffer(8))

/** What can be a seed: a number, a string, a boolean, or a vector of them, to tell streams apart. */
export function isSeed(value: unknown): boolean {
	return Array.isArray(value)
		? value.every(isSeed)
		: typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
}

/** A number from 0 up to, and not including, 1, which is all that `seed` and `i` decide. */
export function randomAt(seed: unknown, i: number): number {
	let a = 0xdeadbeef
	let b = 0x41c6ce57
	const word = (w: number): void => {
		a = Math.imul(a ^ w, 2654435761)
		b = Math.imul(b ^ w, 1597334677)
	}
	const number = (n: number): void => {
		if (Number.isNaN(n)) return word(0x7ff80000)
		// -0 is 0 to any program, so it is here. DataView's order is the same on any machine.
		BITS.setFloat64(0, n === 0 ? 0 : n)
		word(BITS.getUint32(0))
		word(BITS.getUint32(4))
	}
	// Each says what it is first, so that 1, "1" and [1] are three different seeds.
	const said = (value: unknown): void => {
		if (typeof value === 'number') {
			word(1)
			number(value)
		} else if (typeof value === 'string') {
			word(2)
			word(value.length)
			for (let at = 0; at < value.length; at++) word(value.charCodeAt(at))
		} else if (typeof value === 'boolean') {
			word(value ? 3 : 4)
		} else if (Array.isArray(value)) {
			word(5)
			word(value.length)
			value.forEach(said)
		}
	}
	said(seed)
	number(i)
	a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
	b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
	return ((b & 0x1fffff) * 2 ** 32 + (a >>> 0)) / 2 ** 53
}
