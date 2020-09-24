import {Ref} from 'vue'
import {NonReactive} from '@/utils'
import {MalVal, MalNode, isSeq, isNode} from '@/mal/types'
import {HitDetector} from './hit-detector'
import {vec2} from 'gl-matrix'
import AppScope from '@/scopes/app'
import {generateExpAbsPath} from '@/mal/utils'

export default function useHitDetector(exp: Ref<NonReactive<MalNode>>) {
	const detector = new HitDetector()

	AppScope.def('detect-hit', (pos: MalVal) => {
		if (
			isSeq(pos) &&
			typeof pos[0] === 'number' &&
			typeof pos[1] === 'number'
		) {
			const p = vec2.clone(pos as any)
			const ret = detector.analyze(p, exp.value.value)

			if (isNode(ret)) {
				return generateExpAbsPath(ret)
			}
		}

		return false
	})
}
