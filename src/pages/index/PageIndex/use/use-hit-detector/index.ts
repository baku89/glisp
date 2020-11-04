import {vec2} from 'gl-matrix'
import {Ref} from 'vue'

import {MalBoolean, MalColl, MalString, MalVal} from '@/mal/types'
import {generateExpAbsPath} from '@/mal/utils'
import AppScope from '@/scopes/app'

import {HitDetector} from './hit-detector'

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
