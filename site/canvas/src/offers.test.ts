import { buildPrelude, type Env, print, type TypeValue } from '@glisp/lang'
import { reach } from '@glisp/tweeq/rowsClipboard'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { type Offer, offersOf } from './offers'
import { parse } from './program.testing'

const env: Env = withGraphics(buildPrelude())
const root = parse('{main = [r = (path.rect [10 20] [100 50]) c = (path.circle [0 0] 5)]}')
const expectedAt = (path: string) => reach(root, env, path)!.chain.at(-1)!.expected as TypeValue
const find = (offers: readonly Offer[], ...labels: string[]): Offer | undefined => {
	const [first, ...rest] = labels
	const found = offers.find(({ label }) => label === first || label.startsWith(`${first} `))
	return rest.length === 0 ? found : found && find(found.children ?? [], ...rest)
}

describe('what something pointed at offers, where it is not what is asked for', () => {
	it('has its snap points, each of whose numbers can go where a number is asked for', () => {
		const offers = offersOf(root, env, 'binding:c/arg1', 'binding:r', expectedAt('binding:c/arg1'))
		const x = find(offers, 'Snap Points', 'top right', 'X')
		expect(x).toBeDefined()
		// Its right, which is as far along as the rect's origin and size are, together.
		expect(print(x!.written!)).toContain('c = (path.circle [0 0] (+ ../../r/origin:/0 ../../r/size:/0))')
	})

	it('has its parameters, and a place among them as a whole where a place is asked for', () => {
		const offers = offersOf(root, env, 'binding:c/arg0', 'binding:r', expectedAt('binding:c/arg0'))
		const origin = find(offers, 'Parameters', 'origin')
		expect(origin?.written).toBeDefined()
		expect(print(origin!.written!)).toMatch(/c = \(path\.circle \S*r\/origin: 5\)/)
	})

	it('offers nothing of what does not fit, as a place for a number but by its numbers', () => {
		const offers = offersOf(root, env, 'binding:c/arg1', 'binding:r', expectedAt('binding:c/arg1'))
		expect(find(offers, 'Parameters', 'origin')?.written).toBeUndefined()
		expect(find(offers, 'Parameters', 'origin', 'Y')?.written).toBeDefined()
	})
})
