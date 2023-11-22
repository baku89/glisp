import {vec2} from 'linearly'

import {Expr, generateExpAbsPath, isColl, isSeq} from '@/glisp'
import AppScope from '@/scopes/app'
import {useSketchStore} from '@/stores/sketch'

import {HitDetector} from './hit-detector'

export default function useHitDetector() {
	const detector = new HitDetector()

	const sketch = useSketchStore()

	AppScope.def('detect-hit', (pos: Expr) => {
		if (
			isSeq(pos) &&
			typeof pos[0] === 'number' &&
			typeof pos[1] === 'number'
		) {
			const p = vec2.clone(pos as any)
			const ret = detector.analyze(p, sketch.expr as Expr)

			if (isColl(ret)) {
				return generateExpAbsPath(ret)
			}
		}

		return false
	})
}
