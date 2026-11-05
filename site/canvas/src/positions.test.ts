import { buildPrelude, evaluate, type TypedHostFn, type TypeValue } from '@glisp/lang'
import { functionsIn } from '@glisp/tweeq/filters'
import { isAngleInput, isSizeInput, isTranslatable } from '@glisp/tweeq/structure'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { parse } from './program.testing'

const env = withGraphics(buildPrelude())

describe('what goes by an X and a Y', () => {
	it('is a place or a size in every function, with a way to take hold of it as one', () => {
		const bare = functionsIn(env).flatMap(({ name }) => {
			const fn = evaluate(parse(name), env).value as TypedHostFn
			return (fn.paramTypes ?? []).flatMap((type, i) =>
				type.typeName === '[number number]' && !isTranslatable(type) && !isSizeInput(type)
					? [`${name} ${fn.paramNames?.[i] ?? i}`]
					: []
			)
		})
		expect(bare).toEqual([])
	})
})

describe('a stop on a Dubins path', () => {
	it('has a place to take hold of, and a way it goes to turn', () => {
		const fn = evaluate(parse('path.dubinsChain'), env).value as TypedHostFn
		const stops = fn.paramTypes[0]!.shape as { element: TypeValue }
		const [at, angle] = (stops.element.shape as { elements: TypeValue[] }).elements
		expect(isTranslatable(at!)).toBe(true)
		expect(isAngleInput(angle!)).toBe(true)
	})
})
