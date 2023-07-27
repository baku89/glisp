<template>
	<component :is="tag" class="Zoomable" ref="root"><slot /></component>
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import {mat2d, vec2} from 'gl-matrix'
import {defineComponent, PropType, watch} from 'vue'

import useGesture from '@/components/use/use-gesture'
export default defineComponent({
	name: 'Zoomable',
	props: {
		transform: {
			type: Object as PropType<mat2d>,
			required: true,
		},
		tag: {
			type: String,
			default: 'div',
		},
	},
	emits: ['update:transform'],
	setup(props, context) {
		const el = templateRef('root')

		// Gestures for view transform
		useGesture(el, {
			onZoom({pageX, pageY, deltaY}: WheelEvent) {
				if (!el.value) return

				const xform = mat2d.clone(props.transform)

				// Scale
				const deltaScale = 1 + -deltaY * 0.01

				const {left, top} = el.value.getBoundingClientRect()
				const pivot = vec2.fromValues(pageX - left, pageY - top)

				const xformInv = mat2d.invert(mat2d.create(), xform)
				vec2.transformMat2d(pivot, pivot, xformInv)

				mat2d.translate(xform, xform, pivot)
				mat2d.scale(xform, xform, [deltaScale, deltaScale])

				vec2.negate(pivot, pivot)
				mat2d.translate(xform, xform, pivot)

				context.emit('update:transform', xform)
			},
			onScroll({deltaX, deltaY}: WheelEvent) {
				const xform = mat2d.clone(props.transform)

				// Translate
				xform[4] -= deltaX / 2
				xform[5] -= deltaY / 2

				context.emit('update:transform', xform)
			},
			onGrab({deltaX, deltaY}) {
				if (!el.value) return
				const xform = mat2d.clone(props.transform)

				// Translate (pixel by pixel)
				xform[4] += deltaX
				xform[5] += deltaY

				context.emit('update:transform', xform)
			},
			onRotate({rotation, pageX, pageY}) {
				if (!el.value) return

				const {left, top} = el.value.getBoundingClientRect()
				const pivot = vec2.fromValues(pageX - left, pageY - top)

				const xform = mat2d.clone(props.transform)

				vec2.transformMat2d(pivot, pivot, mat2d.invert(mat2d.create(), xform))

				// Rotate
				const rad = (rotation * Math.PI) / 180
				const rot = mat2d.fromRotation(mat2d.create(), -rad)

				mat2d.translate(xform, xform, pivot)
				mat2d.mul(xform, xform, rot)
				mat2d.translate(xform, xform, vec2.negate(vec2.create(), pivot))

				context.emit('update:transform', xform)
			},
		})

		// For touch screen
		if (navigator.maxTouchPoints > 0) {
			watch(el, el => {
				if (!el || !(el instanceof HTMLElement)) return

				let firstTouchId: number | null = null
				let secondTouchId: number | null = null

				let prevTouches: Touch[]

				el.addEventListener('touchstart', e => {
					prevTouches = [...e.touches]

					const touch = e.changedTouches[0]
					if ((touch as any).touchType !== 'direct') return

					if (firstTouchId === null) {
						firstTouchId = e.changedTouches[0].identifier
					} else if (secondTouchId === null) {
						secondTouchId = e.changedTouches[0].identifier
					}
				})

				el.addEventListener('touchmove', e => {
					const touches = [...e.touches]

					if (firstTouchId !== null && secondTouchId === null) {
						// Translate
						const ct = touches.find(t => t.identifier === firstTouchId)
						const pt = prevTouches.find(t => t.identifier === firstTouchId)

						if (!ct || !pt) {
							firstTouchId = secondTouchId = null
							return
						}

						const delta = vec2.fromValues(
							ct.clientX - pt.clientX,
							ct.clientY - pt.clientY
						)

						const xform = mat2d.clone(props.transform)

						vec2.scale(delta, delta, 1 / Math.hypot(xform[0], xform[1]))

						mat2d.translate(xform, xform, delta)

						context.emit('update:transform', xform)
					} else if (firstTouchId !== null && secondTouchId !== null) {
						// Translate / Scale / Rotate
						const pt0 = prevTouches.find(t => t.identifier === firstTouchId)
						const pt1 = prevTouches.find(t => t.identifier === secondTouchId)
						const ct0 = touches.find(t => t.identifier === firstTouchId)
						const ct1 = touches.find(t => t.identifier === secondTouchId)

						if (!ct0 || !ct1 || !pt0 || !pt1) {
							firstTouchId = secondTouchId = null
							return
						}

						const xform = mat2d.clone(props.transform)
						const xformInv = mat2d.invert(mat2d.create(), xform)

						const p0 = vec2.transformMat2d(
							vec2.create(),
							vec2.fromValues(pt0.clientX, pt0.clientY),
							xformInv
						)
						const p1 = vec2.transformMat2d(
							vec2.create(),
							vec2.fromValues(pt1.clientX, pt1.clientY),
							xformInv
						)
						const c0 = vec2.transformMat2d(
							vec2.create(),
							vec2.fromValues(ct0.clientX, ct0.clientY),
							xformInv
						)
						const c1 = vec2.transformMat2d(
							vec2.create(),
							vec2.fromValues(ct1.clientX, ct1.clientY),
							xformInv
						)

						const vp = vec2.sub(vec2.create(), p1, p0)
						const vc = vec2.sub(vec2.create(), c1, c0)

						const scale = vec2.len(vc) / vec2.len(vp)

						mat2d.translate(xform, xform, c0)
						mat2d.scale(xform, xform, vec2.fromValues(scale, scale))
						mat2d.translate(xform, xform, vec2.negate(vec2.create(), p0))
						context.emit('update:transform', xform)
					}

					prevTouches = touches
				})

				el.addEventListener('touchend', e => {
					const changedTouches = [...e.changedTouches]

					if (firstTouchId !== null && secondTouchId === null) {
						// one finger to zero
						const hasReleased = changedTouches.find(
							t => t.identifier === firstTouchId
						)

						if (hasReleased) {
							firstTouchId = null
						}
					} else if (firstTouchId !== null && secondTouchId !== null) {
						// second to one
						const releasedFirst = changedTouches.find(
							t => t.identifier === firstTouchId
						)
						const releasedSecond = changedTouches.find(
							t => t.identifier === secondTouchId
						)

						if (releasedFirst && releasedSecond) {
							firstTouchId = secondTouchId = null
						} else if (releasedFirst && !releasedSecond) {
							firstTouchId = secondTouchId
							secondTouchId = null
						} else if (!releasedFirst && releasedSecond) {
							secondTouchId = null
						}
					}
				})
			})
		}
	},
})
</script>
