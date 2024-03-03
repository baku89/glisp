import {test, expect} from 'vitest'
import {Ast, sym as S} from './ast'
import {evaluate} from './evaluate'
import {Env} from './env'

test('evaluate', () => {
	const env: Env = {
		ast: {
			[Ast]: 'Scope',
			vars: {
				π: Math.PI,
				τ: Math.PI * 2,
			},
		},
	}

	expect(evaluate(S`π`, env)).toBeCloseTo(Math.PI)
	expect(evaluate(S`τ`, env)).toBeCloseTo(Math.PI * 2)
})
