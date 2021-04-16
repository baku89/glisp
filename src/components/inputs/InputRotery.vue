<template>
	<button
		class="InputRotery"
		:class="{tweaking, 'tweak-absolute': tweakMode === 'absolute'}"
		ref="el"
		v-bind="$attrs"
	>
		<svg class="InputRotery__rotery" viewBox="0 0 32 32">
			<circle class="InputRotery__circle" cx="16" cy="16" r="16" />
			<line
				class="InputRotery__scale"
				@mouseenter="tweakMode = 'absolute'"
				@mouseleave="!tweaking ? (tweakMode = 'relative') : null"
				:style="{
					transform: `rotate(${modelValue}rad)`,
				}"
				stroke-
				x1="20"
				y1="16"
				x2="32"
				y2="16"
			/>
		</svg>
	</button>
	<teleport to="body">
		<template v-if="tweaking">
			<svg class="InputRotery__overlay">
				<line
					v-if="tweakMode === 'absolute'"
					class="bold"
					:x1="overlayLineOrigin[0]"
					:y1="overlayLineOrigin[1]"
					:x2="absolutePos[0]"
					:y2="absolutePos[1]"
				/>
				<path
					v-if="tweakMode === 'relative'"
					class="bold"
					:d="overlayArcPath"
				/>
			</svg>
			<div
				class="InputRotery__overlay-label"
				:style="{
					top: absolutePos[1] + 'px',
					left: absolutePos[0] + 'px',
				}"
			>
				{{ overlayLabel }}
				<span
					class="arrows"
					:style="{
						transform: `rotate(${overlayArrowAngle}rad)`,
					}"
				/>
			</div>
		</template>
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

		const overlayArrowAngle = computed(() => {
			return (
				Math.atan2(
					absolutePos.value[1] - origin.value[1],
					absolutePos.value[0] - origin.value[0]
				) +
				Math.PI / 2
			)
		})

		const overlayLineOrigin = computed(() => {
			const o = origin.value
			const t = absolutePos.value
			const radius = 10

			const p = vec2.create()

			vec2.sub(p, t, o)
			vec2.normalize(p, p)
			vec2.scale(p, p, radius)
			vec2.add(p, o, p)

			return p
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

			const c = origin.value

			// Create arc
			const arcRadius = baseRadius + turns * radiusStep

			let offsetInTurn = mod(signedAngleBetween(end, start), PI_2)
			offsetInTurn = tweakingPositive ? offsetInTurn : offsetInTurn - PI_2

			const startInTurn = mod(start, PI_2)
			const endInTurn = startInTurn + offsetInTurn

			const from = addDirectionVector(c, startInTurn, arcRadius)
			const to = addDirectionVector(c, endInTurn, arcRadius)

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
				const right = `${c[0] + radius} ${c[1]}`
				const left = `${c[0] - radius} ${c[1]}`
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
			overlayLineOrigin,
			overlayArcPath,
			overlayLabel,
			overlayArrowAngle,
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
	transition all 0.1s cubic-bezier(0.25, 0.1, 0, 1)
	aspect-ratio 1

	&:hover, &.tweaking
		z-index 1

	&__rotery
		width 100%
		height 100%

	// Enlarge
	&:hover, &.tweaking
		transform scale(3)

	&__circle
		fill var(--base04)

		&:hover
			fill var(--highlight)

	&__scale
		transform-origin 16px 16px
		stroke var(--base00)
		stroke-width 3
		stroke-linecap round

		~/.tweak-absolute &
			stroke var(--highlight)

	&__overlay
		input-overlay()

	&__overlay-label
		z-index 1001
		cursor none
		font-monospace()
		position fixed
		padding 0.4em
		border-radius 4px
		background var(--translucent)
		color var(--highlight)
		font-weight bold
		transition opacity 0.2s ease
		transform translate(-50%, -50%)

		.arrows
			position absolute
			top 0
			left 0
			width 100%
			height 100%

			&:before, &:after
				position absolute
				top 50%
				display block
				width 1em
				text-align center
				font-weight normal
				transform translateY(-50%)

			&:before
				right 100%
				content '<'

			&:after
				left 100%
				content '>'
</style>
