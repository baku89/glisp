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
			<svg class="InputTranslate__overlay">
				<polyline
					class="bold"
					:points="`${origin[0]} ${absolutePos[1]} ${origin[0]} ${origin[1]} ${absolutePos[0]} ${origin[1]}`"
				/>
				<polyline
					class="dashed"
					:points="`${absolutePos[0]} ${origin[1]} ${absolutePos[0]} ${absolutePos[1]} ${origin[0]} ${absolutePos[1]}`"
				/>
			</svg>
			<div
				class="InputTranslate__overlay-label"
				:style="{
					top: absolutePos[1] + 'px',
					left: absolutePos[0] + 'px',
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
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import {computed, defineComponent, PropType, ref} from 'vue'

import useDraggable from '@/components/use/use-draggable'

const ARROW_KEYS = new Set(['up', 'down', 'left', 'right'])

export default defineComponent({
	name: 'InputTranslate',
	props: {
		modelValue: {
			type: [Array, Float32Array] as PropType<number[] | Float32Array>,
			required: true,
		},
	},
	setup(props, context) {
		const el = ref<null | HTMLElement>(null)

		function update(delta: vec2) {
			const newValue = vec2.fromValues(props.modelValue[0], props.modelValue[1])
			vec2.add(newValue, newValue, delta)
			context.emit('update:modelValue', newValue)
		}

		const startValue = ref(vec2.create())

		const {isDragging: tweaking, origin, absolutePos} = useDraggable(el, {
			disableClick: true,
			onDragStart() {
				startValue.value = props.modelValue as vec2
			},
			onDrag({delta}) {
				update(delta)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
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
			origin,
			absolutePos,
			overlayLabel,
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

	&__overlay
		cursor all-scroll
		input-overlay()

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
				width 1em
				height 1em
				text-align center
				font-weight normal
				line-height 1em

			&:before
				content '<'

			&:after
				content '>'

			&.horiz:before
				top 50%
				right 100%
				transform translateY(-50%)

			&.horiz:after
				top 50%
				left 100%
				transform translateY(-50%)

			&.vert:before
				top -1em
				transform rotate(90deg)

			&.vert:after
				bottom -1em
				transform rotate(90deg)
</style>
