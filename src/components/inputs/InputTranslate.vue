<template>
	<button
		class="InputTranslate"
		:class="{tweaking}"
		ref="el"
		@keydown="onKeydown"
		v-bind="$attrs"
	/>
	<teleport to="body">
		<template v-if="tweaking">
			<div
				class="InputTranslate__overlay-label"
				:class="[tweakLabelClass]"
				:style="{
					top: wrappedPos[1] + 'px',
					left: wrappedPos[0] + 'px',
				}"
			>
				{{ overlayLabel }}
				<span class="arrows horiz" />
				<span class="arrows vert" />
			</div>
		</template>
	</teleport>
</template>

<script lang="ts">
import {useMagicKeys} from '@vueuse/core'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

import useDraggable from '@/components/use/use-draggable'
import {unsignedMod} from '@/utils'

const ARROW_KEYS = new Set(['up', 'down', 'left', 'right'])

export default defineComponent({
	name: 'InputTranslate',
	props: {
		modelValue: {
			type: [Array, Float32Array] as PropType<number[] | Float32Array>,
			required: true,
		},
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const el = ref<null | HTMLElement>(null)

		function update(delta: vec2) {
			const newValue = vec2.fromValues(props.modelValue[0], props.modelValue[1])
			vec2.add(newValue, newValue, delta)
			context.emit('update:modelValue', newValue)
		}

		const startValue = ref(vec2.create())
		let tweakStartValue = vec2.create()
		let tweakStartPos = vec2.create()

		const {isDragging: tweaking, pos} = useDraggable(el, {
			disableClick: true,
			lockPointer: true,
			onDragStart() {
				startValue.value = props.modelValue as vec2
				tweakSpeedChanged.value = true
			},
			onDrag({pos}) {
				if (tweakSpeedChanged.value) {
					tweakStartValue = props.modelValue as vec2
					tweakStartPos = pos
					tweakSpeedChanged.value = false
				}

				const delta = vec2.sub(vec2.create(), pos, tweakStartPos)

				const multipliedDelta = vec2.scale(
					vec2.create(),
					delta,
					tweakSpeed.value
				)

				const val = vec2.add(vec2.create(), tweakStartValue, multipliedDelta)
				context.emit('update:modelValue', val)
			},
		})

		const wrappedPos = computed(() => [
			unsignedMod(pos.value[0], window.innerWidth),
			unsignedMod(pos.value[1], window.innerHeight),
		])

		const {shift, alt} = useMagicKeys()
		watch([shift, alt], () => (tweakSpeedChanged.value = true))

		const tweakSpeedChanged = ref(false)

		const tweakLabelClass = computed(() =>
			shift.value ? 'fast' : alt.value ? 'slow' : ''
		)

		const tweakSpeed = computed(() => {
			if (shift.value) return 10
			if (alt.value) return 0.1
			return 1
		})

		function onKeydown(e: KeyboardEvent) {
			const key = keycode(e)

			if (ARROW_KEYS.has(key)) {
				e.preventDefault()

				let inc = 1
				if (e.altKey) {
					inc = 0.1
				} else if (e.shiftKey) {
					inc = 10
				}

				switch (key) {
					case 'left':
						update([-inc, 0])
						break
					case 'right':
						update([inc, 0])
						break
					case 'up':
						update([0, -inc])
						break
					case 'down':
						update([0, inc])
				}
			}
		}

		const overlayLabel = computed(() => {
			const delta = vec2.sub(
				vec2.create(),
				props.modelValue as vec2,
				startValue.value
			)

			return Array.from(delta)
				.map(v => (v > 0 ? '+' : '') + v.toFixed(0))
				.join(',')
		})

		return {
			el,
			tweaking,
			onKeydown,
			wrappedPos,
			overlayLabel,
			tweakLabelClass,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputTranslate
	position relative
	margin $subcontrol-margin
	width $subcontrol-height
	border-radius $input-round
	background var(--base04)
	aspect-ratio 1
	input-transition(background)
	cursor all-scroll

	&:focus
		box-shadow 0 0 0 1px var(--accent)

	&:hover, &.tweaking
		background var(--accent)

	// Crosshair
	&:before, &:after
		pseudo-block()
		background var(--base00) !important
		transform translate(-50%, -50%)

	&.tweaking:before, &.tweaking:after
		display none

	&:before
		top 50%
		left 50%
		width 7px
		height 1px

	&:after
		top 50%
		left 50%
		width 1px
		height 7px

	&__overlay-label
		tooltip()
		z-index 1001
		transform translate(-50%, -50%)
		font-monospace()
		position fixed

		.arrows
			position absolute

			&.horiz
				top 0
				left 0
				width 100%
				height 100%

			&.vert
				top 0
				left calc(50% - 0.5em)
				width 0
				height 100%

			&:before, &:after
				position absolute
				display block
				width 2em
				height 1em
				text-align center
				font-weight normal
				line-height 1em

			&:before
				content '\00a0<\00a0'

			&:after
				content '\00a0>\00a0'

			&.horiz:before
				top 50%
				right 100%
				margin-right -0.5em
				transform translateY(-50%)

			&.horiz:after
				top 50%
				left 100%
				margin-left -0.5em
				transform translateY(-50%)

			&.vert:before
				top -1em
				transform rotate(90deg)

			&.vert:after
				bottom -1em
				transform rotate(90deg)

		&.fast .arrows
			&:before
				content '<<\00a0'

			&:after
				content '\00a0>>'

		&.slow .arrows
			&:before
				content '\00a0<~'

			&:after
				content '~>\00a0'
</style>
