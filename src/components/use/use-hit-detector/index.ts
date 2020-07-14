import {
	Ref,
	watch,
	onUnmounted,
	ref,
	onMounted,
	isRef
} from '@vue/composition-api'

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

function useOnMouseMove(el: Ref<HTMLElement | null> | HTMLElement) {
	const mouseX = ref(0)
	const mouseY = ref(0)

	function onMousemove(e: MouseEvent) {
		mouseX.value = e.pageX
		mouseY.value = e.pageY
	}

	function setup(el: HTMLElement) {
		;(el as any).$el.addEventListener('mousemove', onMousemove)
	}

	if (isRef(el)) {
		onMounted(() => {
			if (!el.value) return
			setup(el.value)
		})
	} else {
		setup(el)
	}

	onUnmounted(() => {
		const _el = isRef(el) ? el.value : el
		;(_el as any).$el.removeEventListener('mousemove', onMousemove)
	})

	return {mouseX, mouseY}
}

export default function useHitDetector(
	handleEl: Ref<HTMLElement | null>,
	exp: Ref<NonReactive<MalVal> | null>,
	viewTransform: Ref<mat2d>,
	onSelectExp: (exp: NonReactive<MalNode> | null) => void,
	onHoverExp: (exp: NonReactive<MalNode> | null) => void,
	onTransformSelectedExp: (transform: mat2d) => void
) {
	const detector = new HitDetector()

	const {mouseX, mouseY} = useOnMouseMove(handleEl)
	const {mousePressed} = useMouseButtons(handleEl)

	let prevMousePressed = false
	let prevExp: NonReactive<MalVal> | null = null
	let prevPos = vec2.fromValues(0, 0)
	let draggingExp: NonReactive<MalVal> | null = null

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
			const isSameExp = prevExp === exp.value

			// console.time('hit')
			const ret = await detector.analyze(
				pos,
				isSameExp ? undefined : exp.value.value
			)
			// console.timeEnd('hit')

			const hitExp = ret ? nonReactive(ret as MalNode) : null

			// On mouse down
			const justMousedown = mousePressed.value && !prevMousePressed
			const justMouseup = !mousePressed.value && prevMousePressed

			if (justMousedown) {
				onSelectExp(hitExp)
				draggingExp = hitExp
			}

			// On mouse up
			if (justMouseup) {
				draggingExp = null
			}

			// On dragging
			if (!justMousedown && mousePressed.value && draggingExp) {
				const delta = vec2.sub(vec2.create(), pos, prevPos)
				const xform = mat2d.fromTranslation(mat2d.create(), delta)
				onTransformSelectedExp(xform)
			}

			// if (hoveringExp && hoveringExp.value.value !== ret)
			onHoverExp(hitExp)

			// Update
			prevMousePressed = mousePressed.value
			prevExp = exp.value
			prevPos = pos
		}
	)
}
