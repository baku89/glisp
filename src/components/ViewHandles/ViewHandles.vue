<template>
	<div class="ViewHandles" ref="el">
		<Portal to="view-handles-axes">
			<svg class="ViewHandles__axes-portal">
				<defs>
					<marker
						id="arrow-x"
						viewBox="0 0 10 10"
						refX="10"
						refY="5"
						markerUnits="strokeWidth"
						markerWidth="10"
						markerHeight="10"
						orient="auto-start-reverse"
					>
						<path class="stroke axis-x" d="M 0 0 L 10 5 L 0 10" />
					</marker>
					<marker
						id="arrow-y"
						viewBox="0 0 10 10"
						refX="10"
						refY="5"
						markerUnits="strokeWidth"
						markerWidth="10"
						markerHeight="10"
						orient="auto-start-reverse"
					>
						<path class="stroke axis-y" d="M 0 0 L 10 5 L 0 10" />
					</marker>
				</defs>
				<g :transform="`matrix(${viewTransform.join(' ')})`">
					<path class="ViewHandles__axis stroke" d="M -50000 0 H 50000" />
					<path class="ViewHandles__axis stroke" d="M 0 -50000 V 50000" />
				</g>
				<g
					class="ViewHandles__gnomon"
					v-if="handleCallbacks"
					:transform="transformStyle"
				>
					<path class="stroke axis-x" marker-end="url(#arrow-x)" d="M 0 0 H 200" />
					<path class="stroke axis-y" marker-end="url(#arrow-y)" d="M 0 0 V 200" />
				</g>
			</svg>
		</Portal>
		<svg class="ViewHandles__handles">
			<path
				class="stroke"
				v-if="selectedPath"
				:d="selectedPath"
				:transform="`matrix(${transform.join(' ')})`"
			/>
			<g
				v-for="({type, id, transform, yTransform, path, cls, guide},
				i) in handles"
				:key="i"
				:class="cls"
				:hoverrable="draggingIndex === null && !guide"
				:dragging="draggingIndex === i"
				:transform="transform"
				@mousedown="!guide && onMousedown(i, $event)"
			>
				<template v-if="type === 'path'">
					<path class="stroke hover-zone" :d="path" />
					<path class="stroke display" :d="path" />
				</template>
				<template v-else-if="type === 'dia'">
					<path class="fill display" d="M 7 0 L 0 7 L -7 0 L 0 -7 Z" />
				</template>
				<template v-else>
					<path
						v-if="type === 'arrow'"
						class="stroke display"
						d="M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5"
					/>
					<template v-if="type === 'translate'">
						<path class="stroke display" d="M 12 0 H -12" />
						<path class="stroke display" :transform="yTransform" d="M 0 12 V -12" />
					</template>
					<circle class="fill display" :class="cls" cx="0" cy="0" :r="rem * 0.5" />
				</template>
			</g>
		</svg>
	</div>
</template>

<script lang="ts">
import {
	MalVal,
	keywordFor as K,
	createList as L,
	isMap,
	MalSeq,
	MalMap,
	MalFunc,
	isVector,
	getEvaluated,
	malEquals,
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {getSVGPathData, getSVGPathDataRecursive} from '@/path-utils'
import {
	getFnInfo,
	FnInfoType,
	getMapValue,
	reverseEval,
	computeExpTransform,
	copyDelimiters,
	replaceExp,
} from '@/mal/utils'
import {NonReactive} from '@/utils'
import {useRem, useGesture} from '@/components/use'
import {
	defineComponent,
	computed,
	reactive,
	toRefs,
	onBeforeMount,
	ref,
	SetupContext,
	Ref,
	toRef,
} from '@vue/composition-api'
import AppScope from '@/scopes/app'
import {convertMalNodeToJSObject} from '@/mal/reader'
import useHandle from './use-handle'

interface Props {
	exp: NonReactive<MalSeq> | null
	viewTransform: mat2d
}

export default defineComponent({
	props: {
		exp: {
			required: true,
			// validator: v => v instanceof NonReactive,
		},
		viewTransform: {
			type: Float32Array,
			default: () => mat2d.identity(mat2d.create()),
		},
	},
	setup(props: Props, context: SetupContext) {
		const el: Ref<HTMLElement | null> = ref(null)

		const handleData = useHandle(
			toRef(props, 'exp'),
			toRef(props, 'viewTransform'),
			el,
			context
		)

		// Gestures for view transform
		useGesture(el, {
			onZoom({pageX, pageY, deltaY}: MouseWheelEvent) {
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
			onScroll({deltaX, deltaY}: MouseWheelEvent) {
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
