import {Ref} from 'vue'
import {MalVal, MalColl, isMalSeq, isMalColl, MalBoolean} from '@/mal/types'
import {HitDetector} from './hit-detector'
import {vec2} from 'gl-matrix'
import AppScope from '@/scopes/app'
import {generateExpAbsPath} from '@/mal/utils'

export default function useHitDetector(exp: Ref<MalColl>) {
	const detector = new HitDetector()

	AppScope.defn('detect-hit', (pos: MalVal) => {
		if (
			isMalSeq(pos) &&
			typeof pos[0] === 'number' &&
			typeof pos[1] === 'number'
		) {
			const p = vec2.clone(pos as any)
			const ret = detector.analyze(p, exp.value)

			if (ret) {
				return generateExpAbsPath(ret)
			}
		}

		return MalBoolean.create(false)
	})
}
