import {vec2} from 'linearly'
import {Ref} from 'vue'

import {isNode, isSeq, MalNode, MalVal} from '@/mal/types'
import {generateExpAbsPath} from '@/mal/utils'
import AppScope from '@/scopes/app'

import {HitDetector} from './hit-detector'

export default function useHitDetector(exp: Ref<MalNode>) {
	const detector = new HitDetector()

	AppScope.def('detect-hit', (pos: MalVal) => {
		if (
			isSeq(pos) &&
			typeof pos[0] === 'number' &&
			typeof pos[1] === 'number'
		) {
			const p = vec2.clone(pos as any)
			const ret = detector.analyze(p, exp.value)

			if (isNode(ret)) {
				return generateExpAbsPath(ret)
			}
		}

		return false
	})
}
