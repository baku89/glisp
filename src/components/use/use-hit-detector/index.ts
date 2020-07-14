import {Ref, watch, onUnmounted, ref, onMounted} from '@vue/composition-api'
import {useOnMouseMove} from 'vue-composable'

import {NonReactive, nonReactive} from '@/utils'
import {MalVal, MalNode} from '@/mal/types'

import {HitDetector} from './hit-detector'
import {vec2, mat2d} from 'gl-matrix'

function useMouseButtons(el: Ref<any | null>) {
	const mousePressed = ref(false)

	function onMouseEvent(e: MouseEvent) {
		if (e.target !== el.value?.$el) {
			return
		}
		if (e.button === 0) {
			mousePressed.value = e.type === 'mousedown'
		}
	}

	onMounted(() => {
		if (!el.value) return
		el.value.$el.addEventListener('mousedown', onMouseEvent)
		window.addEventListener('mouseup', onMouseEvent)
	})

	onUnmounted(() => {
		if (!el.value) return
		el.value.$el.removeEventListener('mousedown', onMouseEvent)
		window.removeEventListener('mouseup', onMouseEvent)
	})

	return {mousePressed}
}

export default function useHitDetector(
	handleEl: Ref<HTMLElement | null>,
	exp: Ref<NonReactive<MalVal> | null>,
	viewTransform: Ref<mat2d>,
	onSelectExp: (exp: NonReactive<MalNode> | null) => void,
	onHoverExp: (exp: NonReactive<MalNode> | null) => void
) {
	const detector = new HitDetector()

	const {mouseX, mouseY} = useOnMouseMove(document.body)
	const {mousePressed} = useMouseButtons(handleEl)

	let prevExp: NonReactive<MalVal> | null = null

	watch(
		() => [viewTransform.value, mouseX.value, mouseY.value, mousePressed.value],
		async () => {
			if (!exp.value) return

			const pos = vec2.fromValues(mouseX.value, mouseY.value)

			vec2.transformMat2d(
				pos,
				pos,
				mat2d.invert(mat2d.create(), viewTransform.value)
			)

			// Do the hit detection
			const isSame = prevExp === exp.value

			const ret = await detector.analyze(
				pos,
				isSame ? undefined : exp.value.value
			)

			const hitExp = ret ? nonReactive(ret as MalNode) : null

			if (mousePressed.value) {
				onSelectExp(hitExp)
			}

			// if (hoveringExp && hoveringExp.value.value !== ret)
			onHoverExp(hitExp)

			// Update
			mousePressed.value = false
			prevExp = exp.value
		}
	)
}
