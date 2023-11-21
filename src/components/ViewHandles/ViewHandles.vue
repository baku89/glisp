<template>
	<div ref="el" class="ViewHandles">
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
					v-if="handleCallbacks"
					:transform="transformStyle"
					class="ViewHandles__gnomon"
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
			<g v-for="(_, selectedIndex) in selectedExp" :key="selectedIndex">
				<path
					v-if="selectedPath[selectedIndex]"
					:d="selectedPath[selectedIndex]"
					:transform="`matrix(${transform[selectedIndex].join(' ')})`"
					class="stroke"
				/>
				<g
					v-for="(
						{type, transform: xform, yTransform, path, cls, guide}, handleIndex
					) in handles[selectedIndex]"
					:key="handleIndex"
					:class="cls"
					:dragging="
						draggingIndex &&
						draggingIndex[0] === selectedIndex &&
						draggingIndex[1] === handleIndex
					"
					:hoverrable="draggingIndex === null && !guide"
					:transform="xform"
					@mousedown="
						!guide && onMousedown([selectedIndex, handleIndex], $event)
					"
				>
					<template v-if="type === 'path'">
						<path :d="path" class="stroke hover-zone" />
						<path :d="path" class="stroke display" />
					</template>
					<path
						v-else-if="type === 'dia'"
						class="fill display"
						d="M 7 0 L 0 7 L -7 0 L 0 -7 Z"
					/>
					<template v-else>
						<path
							v-if="type === 'arrow'"
							class="stroke display"
							d="M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5"
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

<script lang="ts" setup>
import {mat2d, vec2} from 'linearly'
import {computed, Ref, ref, toRef} from 'vue'

import {useGesture, useRem} from '@/components/use'
import {ExprColl, ExprSeq} from '@/glisp'
import AppScope from '@/scopes/app'

import useHandle from './use-handle'

interface Props {
	activeExp: ExprSeq | null
	selectedExp: ExprColl[]
	viewTransform: mat2d
}

const props = defineProps<Props>()

const emit = defineEmits<{
	'update:view-transform': [value: mat2d]
	'tag-history': [tag: string]
}>()

const el: Ref<HTMLElement | null> = ref(null)

const viewAxisStyle = computed(() => `matrix(${props.viewTransform.join(' ')})`)

const {
	draggingIndex,
	handles,
	onMousedown,
	transform,
	selectedPath,
	handleCallbacks,
	transformStyle,
} = useHandle(
	toRef(props, 'selectedExp'),
	toRef(props, 'viewTransform'),
	el,
	emit
)

// Gestures for view transform
useGesture(el, {
	onZoom({pageX, pageY, deltaY}: WheelEvent) {
		if (!el.value) return

		let xform = props.viewTransform

		// Scale
		const deltaScale = 1 + -deltaY * 0.01

		const {left, top} = el.value.getBoundingClientRect()
		let pivot: vec2 = [pageX - left, pageY - top]

		const xformInv = mat2d.invert(xform) ?? mat2d.ident
		pivot = vec2.transformMat2d(pivot, xformInv)

		xform = mat2d.translate(xform, pivot)
		xform = mat2d.scale(xform, [deltaScale, deltaScale])

		pivot = vec2.negate(pivot)
		xform = mat2d.translate(xform, pivot)

		emit('update:view-transform', xform)
	},
	onScroll({deltaX, deltaY}: WheelEvent) {
		const xform = mat2d.clone(props.viewTransform as mat2d)

		// Translate
		xform[4] -= deltaX / 2
		xform[5] -= deltaY / 2

		emit('update:view-transform', xform)
	},
	onGrab({deltaX, deltaY}) {
		if (!el.value) return
		const xform = mat2d.clone(props.viewTransform as mat2d)

		// Translate (pixel by pixel)
		xform[4] += deltaX
		xform[5] += deltaY

		emit('update:view-transform', xform)
	},
	onRotate({rotation, pageX, pageY}) {
		if (!el.value) return

		const {left, top} = el.value.getBoundingClientRect()
		let pivot: vec2 = [pageX - left, pageY - top]

		let xform = props.viewTransform

		pivot = vec2.transformMat2d(pivot, mat2d.invert(xform) ?? mat2d.ident)

		// Rotate
		const rad = (rotation * Math.PI) / 180
		const rot = mat2d.fromRotation(-rad)

		xform = mat2d.translate(xform, pivot)
		xform = mat2d.mul(xform, rot)
		xform = mat2d.translate(xform, vec2.negate(pivot))

		emit('update:view-transform', xform)
	},
})

// Register app commands to ConsoleScope
AppScope.def('reset-viewport', () => {
	if (!el.value) return null

	const {width, height} = el.value.getBoundingClientRect()

	const xform = mat2d.fromTranslation([width / 2, height / 2])

	emit('update:view-transform', xform)

	return null
})

// REM
const rem = useRem()
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
@/glis[/types
