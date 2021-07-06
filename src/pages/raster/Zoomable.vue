<template>
	<component :is="tag" class="Zoomable" ref="root"><slot /></component>
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import {mat2d, vec2} from 'gl-matrix'
import {defineComponent, PropType} from 'vue'

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
	},
})
</script>
