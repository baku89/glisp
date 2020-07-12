import {Ref, watch} from '@vue/composition-api'
import {NonReactive} from '@/utils'
import {MalVal} from '@/mal/types'
import {printExp} from '@/mal'

import {HitDetector} from './hit-detector'
import {vec2} from 'gl-matrix'

export default function useHitDetector(
	viewExp: Ref<NonReactive<MalVal> | null>
) {
	const detector = new HitDetector()

	watch(
		() => viewExp.value,
		async () => {
			// Do the hit detection
			// if (!viewExp.value) return
			// const ret = await detector.analyze(vec2.fromValues(0, 0), viewExp.value)
		}
	)
}
