import {Ref} from 'vue'
import {MalVal, MalColl, MalBoolean, MalString} from '@/mal/types'
import {HitDetector} from './hit-detector'
import {vec2} from 'gl-matrix'
import AppScope from '@/scopes/app'
import {generateExpAbsPath} from '@/mal/utils'

export default function useHitDetector(exp: Ref<MalColl>) {
	const detector = new HitDetector()

	AppScope.defn('detect-hit', (pos: MalVal) => {
		const p = vec2.clone(pos as any)
		const ret = detector.analyze(p, exp.value)

		if (ret) {
			return MalString.from(generateExpAbsPath(ret))
		}

		return MalBoolean.from(false)
	})
}
