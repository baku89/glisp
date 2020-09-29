<template>
	<div class="ViewHandles" ref="el">
		<teleport to="#view-handles-axes">
			<svg class="ViewHandles__axes-portal">
				<defs>
					<marker
						id="arrow-x"
						markerHeight="10"
						markerUnits="strokeWidth"
						markerWidth="10"
						orient="auto-start-reverse"
						refX="10"
						refY="5"
						viewBox="0 0 10 10"
					>
						<path class="stroke axis-x" d="M 0 0 L 10 5 L 0 10" />
					</marker>
					<marker
						id="arrow-y"
						markerHeight="10"
						markerUnits="strokeWidth"
						markerWidth="10"
						orient="auto-start-reverse"
						refX="10"
						refY="5"
						viewBox="0 0 10 10"
					>
						<path class="stroke axis-y" d="M 0 0 L 10 5 L 0 10" />
					</marker>
				</defs>
				<g :transform="viewAxisStyle">
					<path class="ViewHandles__axis stroke" d="M -50000 0 H 50000" />
					<path class="ViewHandles__axis stroke" d="M 0 -50000 V 50000" />
				</g>
				<g
					:transform="transformStyle"
					class="ViewHandles__gnomon"
					v-if="handleCallbacks"
				>
					<path
						class="stroke axis-x"
						d="M 0 0 H 200"
						marker-end="url(#arrow-x)"
					/>
					<path
						class="stroke axis-y"
						d="M 0 0 V 200"
						marker-end="url(#arrow-y)"
					/>
				</g>
			</svg>
		</teleport>
		<svg class="ViewHandles__handles">
			<g :key="selectedIndex" v-for="(_, selectedIndex) in selectedExp">
				<path
					:d="selectedPath[selectedIndex]"
					:transform="`matrix(${transform[selectedIndex].join(' ')})`"
					class="stroke"
					v-if="selectedPath[selectedIndex]"
				/>
				<g
					:class="cls"
					:dragging="
						draggingIndex &&
						draggingIndex[0] === selectedIndex &&
						draggingIndex[1] === handleIndex
					"
					:hoverrable="draggingIndex === null && !guide"
					:key="handleIndex"
					:transform="transform"
					@mousedown="
						!guide && onMousedown([selectedIndex, handleIndex], $event)
					"
					v-for="({type, transform, yTransform, path, cls, guide},
					handleIndex) in handles[selectedIndex]"
				>
					<template v-if="type === 'path'">
						<path :d="path" class="stroke hover-zone" />
						<path :d="path" class="stroke display" />
					</template>
					<path
						class="fill display"
						d="M 7 0 L 0 7 L -7 0 L 0 -7 Z"
						v-else-if="type === 'dia'"
					/>
					<template v-else>
						<path
							class="stroke display"
							d="M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5"
							v-if="type === 'arrow'"
						/>
						<template v-else-if="type === 'translate'">
							<path class="stroke display" d="M 12 0 H -12" />
							<path
								:transform="yTransform"
								class="stroke display"
								d="M 0 12 V -12"
							/>
						</template>
						<circle
							:class="cls"
							:r="rem * 0.5"
							class="fill display"
							cx="0"
							cy="0"
						/>
					</template>
				</g>
			</g>
		</svg>
	</div>
</template>

<script lang="ts">
import {MalNode} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {NonReactive} from '@/utils'
import {useRem, useGesture} from '@/components/use'
import {defineComponent, computed, ref, toRef, PropType} from 'vue'
import AppScope from '@/scopes/app'
import useHandle from './use-handle'

export default defineComponent({
	props: {
		selectedExp: {
			type: Array as PropType<NonReactive<MalNode>[]>,
			required: true,
		},
		viewTransform: {
			type: Float32Array as PropType<mat2d>,
			default: () => mat2d.identity(mat2d.create()),
		},
	},
	setup(props, context) {
		const el = ref<HTMLElement | null>(null)

		const viewAxisStyle = computed(
			() => `matrix(${props.viewTransform.join(' ')})`
		)

		const handleData = useHandle(
			toRef(props, 'selectedExp'),
			toRef(props, 'viewTransform'),
			el,
			context
		)

		// Gestures for view transform
		useGesture(el, {
			onZoom({pageX, pageY, deltaY}: WheelEvent) {
				if (!el.value) return

				const xform = mat2d.clone(props.viewTransform as mat2d)

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

				context.emit('update:view-transform', xform)
			},
			onScroll({deltaX, deltaY}: WheelEvent) {
				const xform = mat2d.clone(props.viewTransform as mat2d)

				// Translate
				xform[4] -= deltaX / 2
				xform[5] -= deltaY / 2

				context.emit('update:view-transform', xform)
			},
			onGrab({deltaX, deltaY}) {
				if (!el.value) return
				const xform = mat2d.clone(props.viewTransform as mat2d)

				// Translate (pixel by pixel)
				xform[4] += deltaX
				xform[5] += deltaY

				context.emit('update:view-transform', xform)
			},
			onRotate({rotation, pageX, pageY}) {
				if (!el.value) return

				const {left, top} = el.value.getBoundingClientRect()
				const pivot = vec2.fromValues(pageX - left, pageY - top)

				const xform = mat2d.clone(props.viewTransform)

				vec2.transformMat2d(pivot, pivot, mat2d.invert(mat2d.create(), xform))

				// Rotate
				const rad = (rotation * Math.PI) / 180
				const rot = mat2d.fromRotation(mat2d.create(), -rad)

				mat2d.translate(xform, xform, pivot)
				mat2d.mul(xform, xform, rot)
				mat2d.translate(xform, xform, vec2.negate(vec2.create(), pivot))

				context.emit('update:view-transform', xform)
			},
		})

		// Register app commands to ConsoleScope
		AppScope.def('reset-viewport', () => {
			if (!el.value) return null

			const {width, height} = el.value.getBoundingClientRect()

			const xform = mat2d.create()
			mat2d.fromTranslation(xform, vec2.fromValues(width / 2, height / 2))

			context.emit('update:view-transform', xform)

			return null
		})

		// REM
		const rem = useRem()

		return {
			el,
			viewAxisStyle,
			...handleData,
			rem,
		}
	},
})
</script>

<style lang="stylus" scoped>
.ViewHandles
	position relative
	overflow hidden
	height 100%

	// Portal
	&__axes-portal
		position relative
		overflow hidden
		width 100%
		height 100%

	&__axis
		stroke var(--guide) !important
		stroke-dasharray 1 4

	// Handles
	&__handles
		position relative
		overflow hidden
		width 100%
		height 100%

	// Styles
	&, &__axes-portal
		.fill, .stroke
			stroke var(--highlight)
			stroke-width 1
			vector-effect non-scaling-stroke

		.fill
			fill var(--background)

		.stroke
			stroke var(--highlight)
			vector-effect non-scaling-stroke
			fill none

		// Classes
		.dashed
			stroke-dasharray 3 2

		.axis-x, .axis-y
			opacity 0.5

		.axis-x, .axis-x .display
			stroke var(--red) !important

		.axis-y, .axis-y .display
			stroke var(--green) !important

	// Hover behavior
	*[hoverrable]:hover, *[dragging]
		.stroke.display
			stroke-width 3

		.fill.display
			fill var(--highlight)

		&.dashed
			stroke-dasharray none

	e, .hover-zone
		stroke transparent
		stroke-width 20
</style>
