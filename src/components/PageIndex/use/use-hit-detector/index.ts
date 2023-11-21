import {vec2} from 'linearly'
import {Ref} from 'vue'

import {isColl, isSeq, ExprColl, Expr} from '@/glisp/types'
import {generateExpAbsPath} from '@/glisp/utils'
import AppScope from '@/scopes/app'

import {HitDetector} from './hit-detector'

export default function useHitDetector(exp: Ref<ExprColl>) {
	const detector = new HitDetector()

	AppScope.def('detect-hit', (pos: Expr) => {
		if (
			isSeq(pos) &&
			typeof pos[0] === 'number' &&
			typeof pos[1] === 'number'
		) {
			const p = vec2.clone(pos as any)
			const ret = detector.analyze(p, exp.value)

			if (isColl(ret)) {
				return generateExpAbsPath(ret)
			}
		}

		return false
	})
}
