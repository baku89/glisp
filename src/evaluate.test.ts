import {expect, test, vi} from 'vitest'

import {list as L, scope, sym as S} from './ast'
import {Env} from './env'
import {evaluate} from './evaluate'

test('evaluate', () => {
	expect(evaluate(S`π`)).toBe(Math.PI)
	expect(evaluate(S`τ`)).toBe(Math.PI * 2)
	expect(evaluate(L(S`+`, 1, 2))).toBe(3)
	expect(evaluate(L(S`*`, 1, 2))).toBe(2)
})

test('evaluation cache works', () => {
	const inc = vi.fn((x: number) => x + 1)

	const ast = L(inc, 1, 2)
	evaluate(ast)
	evaluate(ast)

	expect(inc).toHaveBeenCalledTimes(1)
})

test('identical asts with different envs return different results', () => {
	const ast = S`a`

	const env1: Env = {ast: scope({a: 1})}
	const env2: Env = {ast: scope({a: 2})}

	expect(evaluate(ast, env1)).toBe(1)
	expect(evaluate(ast, env2)).toBe(2)
})
