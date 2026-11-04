import { describe, expect, it } from 'vitest'

import { lit } from './build.js'
import { AS_SOURCE, toAst } from './eval.js'
import { print } from './print.js'

describe('AS_SOURCE', () => {
	class Opaque {
		[AS_SOURCE]() {
			return lit('written')
		}
	}

	it('is how a host value is written', () => {
		expect(print(toAst(new Opaque(), null))).toBe('"written"')
	})

	it('is how it is written, inside something else', () => {
		expect(print(toAst([new Opaque()], null))).toBe('["written"]')
	})
})
