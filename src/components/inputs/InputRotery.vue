<template>
	<button
		class="InputRotery"
		:class="{tweaking, 'tweak-absolute': tweakMode === 'absolute'}"
		ref="el"
		v-bind="$attrs"
	>
		<SvgIcon mode="block" class="InputRotery__rotery">
			<circle class="InputRotery__circle" cx="16" cy="16" r="16" />
			<line
				class="InputRotery__scale"
				@mouseenter="tweakMode = 'absolute'"
				@mouseleave="!tweaking ? (tweakMode = 'relative') : null"
				:style="{
					transform: `rotate(${modelValue}rad)`,
				}"
				x1="20"
				y1="16"
				x2="32"
				y2="16"
			/>
		</SvgIcon>
	</button>
	<teleport to="body">
		<template v-if="tweaking">
			<svg class="InputRotery__overlay">
				<line
					v-if="tweakMode === 'absolute'"
					class="bold"
					:x1="overlayLineOrigin[0]"
					:y1="overlayLineOrigin[1]"
					:x2="clampedPos[0]"
					:y2="clampedPos[1]"
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
					top: clampedPos[1] + 'px',
					left: clampedPos[0] + 'px',
				}"
				ref="overlayLabel"
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
import {templateRef, useElementSize} from '@vueuse/core'
import {vec2} from 'gl-matrix'
import {checkIntersection} from 'line-intersect'
import _ from 'lodash'
import {computed, defineComponent, Ref, ref} from 'vue'

import SvgIcon from '@/components/layouts/SvgIcon.vue'
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
	components: {
		SvgIcon,
	},
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

		const {
			isDragging: tweaking,
			origin,
			pos,
		} = useDraggable(el, {
			disableClick: true,
			lockPointer: true,
			onDragStart({pos, origin}) {
				if (tweakMode.value === 'absolute') {
					const p = vec2.sub(vec2.create(), pos, origin)
					const angle = Math.atan2(p[1], p[0])
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
			onDrag({pos, prevPos, origin}) {
				if (alreadyEmitted) {
					alreadyEmitted = false
					return
				}

				const p = vec2.sub(vec2.create(), pos, origin)
				const pp = vec2.sub(vec2.create(), prevPos, origin)

				const prevAngle = Math.atan2(pp[1], pp[0])
				const alignedPos = vec2.rotate(vec2.create(), p, [0, 0], -prevAngle)
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
			const p = vec2.sub(vec2.create(), pos.value, origin.value)
			return Math.atan2(p[1], p[0]) + Math.PI / 2
		})

		const overlayLineOrigin = computed(() => {
			const o = origin.value
			const t = clampedPos.value
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
				if (radius < 0) {
					continue
				}
				const right = `${c[0] + radius} ${c[1]}`
				const left = `${c[0] - radius} ${c[1]}`
				circles += `M ${right}
										A ${radius} ${radius} 0 1 0 ${left}
										A ${radius} ${radius} 0 1 0 ${right}`
			}

			return arc + circles
		})

		const overlayLabelEl = templateRef('overlayLabel')

		const {height: overlayLabelHeight} = useElementSize(overlayLabelEl)

		const clampedPos = computed<vec2>(() => {
			const [x, y] = pos.value
			const [ox, oy] = origin.value
			const margin = overlayLabelHeight.value * 2
			const left = margin,
				top = margin,
				right = window.innerWidth - margin,
				bottom = window.innerHeight - margin

			let ret: ReturnType<typeof checkIntersection>

			const check = _.partial(checkIntersection, x, y, ox, oy)

			if ((ret = check(left, top, right, top)).type === 'intersecting') {
				return [ret.point.x, ret.point.y]
			}

			if ((ret = check(right, top, right, bottom)).type === 'intersecting') {
				return [ret.point.x, ret.point.y]
			}

			if ((ret = check(right, bottom, left, bottom)).type === 'intersecting') {
				return [ret.point.x, ret.point.y]
			}

			if ((ret = check(left, bottom, left, top)).type === 'intersecting') {
				return [ret.point.x, ret.point.y]
			}

			return [x, y]
		})

		return {
			el,
			tweaking,
			tweakMode,
			startValue,

			// overlay
			clampedPos,
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
	display block
	overflow hidden
	width $input-height
	border-radius $input-round
	transition transform 0.1s cubic-bezier(0.25, 0.1, 0, 1)
	aspect-ratio 1

	&:hover, &.tweaking
		z-index 1

	&:focus:not(:hover):not(.tweaking)
		background base16('01')
		transition transform 0.1s cubic-bezier(0.25, 0.1, 0, 1), background 0.1s ease 0.1s

	&__rotery
		margin $subcontrol-margin
		width $subcontrol-height
		height $subcontrol-height

	// Enlarge
	&:hover, &.tweaking
		transform scale(3)

	&__circle
		fill base16('accent')
		stroke none

		~/.tweak-absolute &
			fill base16('01')

	&__scale
		transform-origin 16px 16px
		stroke base16('00')
		stroke-width 3
		stroke-linecap round

		~/.tweak-absolute &
			stroke base16('accent')

	&__overlay
		input-overlay()

	&__overlay-label
		z-index 1001
		tooltip()
		position fixed
		cursor none
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
