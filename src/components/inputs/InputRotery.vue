<template>
	<button
		class="InputRotery"
		:class="{tweaking, 'tweak-absolute': tweakMode === 'absolute'}"
		ref="el"
		v-bind="$attrs"
	>
		<span
			class="InputRotery__scale"
			@mouseenter="tweakMode = 'absolute'"
			@mouseleave="!tweaking ? (tweakMode = 'relative') : null"
			:style="{
				transform: `rotate(${modelValue}rad)`,
			}"
		/>
	</button>
	<teleport to="body">
		<svg
			v-if="tweaking"
			class="InputRotery__overlay"
			:style="{cursor: overlayCursor}"
		>
			<line
				v-if="tweakMode === 'absolute'"
				class="bold"
				:x1="origin[0]"
				:y1="origin[1]"
				:x2="absolutePos[0]"
				:y2="absolutePos[1]"
			/>
			<path v-if="tweakMode === 'relative'" class="bold" :d="overlayArcPath" />
			<text class="label" :x="absolutePos[0] + 15" :y="absolutePos[1] - 10">
				{{ overlayLabel }}
			</text>
		</svg>
	</teleport>
</template>

<script lang="ts">
import {vec2} from 'gl-matrix'
import {computed, defineComponent, Ref, ref} from 'vue'

import useDraggable from '@/components/use/use-draggable'
import useRem from '@/components/use/use-rem'

function mod(a: number, n: number) {
	return ((a % n) + n) % n
}

function signedAngleBetween(target: number, source: number) {
	const ret = target - source
	return mod(ret + Math.PI, Math.PI * 2) - Math.PI
}

function addDirectionVector(from: vec2, angle: number, radius: number) {
	return vec2.fromValues(
		from[0] + Math.cos(angle) * radius,
		from[1] + Math.sin(angle) * radius
	)
}

const PI = Math.PI
const PI_2 = Math.PI * 2

export default defineComponent({
	name: 'InputRotery',
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
	},
	emits: ['update:modelValue', 'end-tweak'],
	setup(props, context) {
		const el: Ref<null | HTMLElement> = ref(null)

		const tweakMode = ref<'relative' | 'absolute'>('relative')

		let alreadyEmitted = false
		let startValue = ref(props.modelValue)

		const {isDragging: tweaking, origin, absolutePos, pos} = useDraggable(el, {
			disableClick: true,
			onDragStart({pos}) {
				if (tweakMode.value === 'absolute') {
					const angle = Math.atan2(pos[1], pos[0])
					const delta = signedAngleBetween(angle, props.modelValue)
					const newValue = props.modelValue + delta
					context.emit('update:modelValue', newValue)

					alreadyEmitted = true
					startValue.value = newValue
				} else {
					// Relative
					startValue.value = props.modelValue
				}
			},
			onDrag({pos, prevPos}) {
				if (alreadyEmitted) {
					alreadyEmitted = false
					return
				}

				const prevAngle = Math.atan2(prevPos[1], prevPos[0])
				const alignedPos = vec2.rotate(vec2.create(), pos, [0, 0], -prevAngle)
				const delta = Math.atan2(alignedPos[1], alignedPos[0])
				const newValue = props.modelValue + delta

				context.emit('update:modelValue', newValue)
			},
			onDragEnd() {
				tweakMode.value = 'relative'
				context.emit('end-tweak')
			},
		})

		const rem = useRem()

		const overlayLabel = computed(() => {
			const rad = props.modelValue
			const deg = (rad / PI) * 180
			return deg.toFixed(1) + '°'
		})

		const overlayCursor = computed(() => {
			const angle = mod(
				(Math.atan2(pos.value[1], pos.value[0]) / PI) * 180,
				180
			)

			if (angle < 22.5 || angle > 157.5) {
				return 'ns-resize'
			} else if (angle < 67.5) {
				return 'nesw-resize'
			} else if (angle < 112.5) {
				return 'ew-resize'
			} else {
				return 'nwse-resize'
			}
		})

		const overlayArcPath = computed(() => {
			if (!tweaking.value) return ''

			const baseRadius = rem.value * 8
			const radiusStep = rem.value * 0.6

			const start = startValue.value
			const end = props.modelValue

			const tweakingPositive = end - start > 0

			const turns =
				Math.floor(Math.abs(end - start) / PI_2) * Math.sign(end - start)

			const center = origin.value

			// Create arc
			const arcRadius = baseRadius + turns * radiusStep

			let offsetInTurn = mod(signedAngleBetween(end, start), PI_2)
			offsetInTurn = tweakingPositive ? offsetInTurn : offsetInTurn - PI_2

			const startInTurn = mod(start, PI_2)
			const endInTurn = startInTurn + offsetInTurn

			const from = addDirectionVector(center, startInTurn, arcRadius)
			const to = addDirectionVector(center, endInTurn, arcRadius)

			const angleBetween = Math.abs(startInTurn - endInTurn)

			const largeArcFlag = angleBetween > PI ? 1 : 0
			const sweepFlag = tweakingPositive ? 1 : 0

			const arc = `
					M ${from.join(' ')}
					A ${arcRadius} ${arcRadius}
						0 ${largeArcFlag} ${sweepFlag}
						${to.join(' ')} `

			// Create revolutions
			let circles = ''
			for (let i = 0, step = Math.sign(turns); i !== turns; i += step) {
				const radius = baseRadius + i * radiusStep
				const right = `${center[0] + radius} ${center[1]}`
				const left = `${center[0] - radius} ${center[1]}`
				circles += `M ${right}
										A ${radius} ${radius} 0 1 0 ${left}
										A ${radius} ${radius} 0 1 0 ${right}`
			}

			return arc + circles
		})

		return {
			el,
			tweaking,
			tweakMode,
			startValue,

			// overlay
			absolutePos,
			origin,
			overlayArcPath,
			overlayLabel,
			overlayCursor,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRotery
	position relative
	overflow hidden
	padding 0
	width $button-height
	height $button-height
	border-radius 50%
	transition all 0.1s cubic-bezier(0.25, 0.1, 0, 1)

	// background
	&:before
		position absolute
		top 0
		left 0
		display block
		width 100%
		height 100%
		background var(--base04)
		content ''

	// Enlarge
	&:hover, &.tweaking
		transform scale(3)

		&:before
			opacity 0.8

	&__scale
		position absolute
		top 30%
		left 50%
		display block
		width 52%
		height 40%
		border-radius 50% 0 0 50%
		transform-origin 0 50%

		&:before
			position absolute
			top 50%
			left 0
			display block
			width 100%
			height 1px
			background var(--background)
			content ''
			transform translateY(-70%)
			pointer-events none

			~/.tweak-absolute &
				background var(--highlight) !important

	&:hover, &:focus, &.tweaking
		&:before
			background var(--highlight)

		~/__scale:before
			background var(--background)

	&.tweak-absolute:before
		background var(--base04) !important

	&__overlay
		input-overlay()
</style>
