<template>
	<button
		class="InputTranslate"
		:class="{tweaking}"
		ref="el"
		@keydown="onKeydown"
		v-bind="$attrs"
	/>
	<teleport to="body">
		<svg v-if="tweaking" class="InputTranslate__overlay">
			<polyline
				class="bold"
				:points="`${origin[0]} ${absolutePos[1]} ${origin[0]} ${origin[1]} ${absolutePos[0]} ${origin[1]}`"
			/>
			<polyline
				class="dashed"
				:points="`${absolutePos[0]} ${origin[1]} ${absolutePos[0]} ${absolutePos[1]} ${origin[0]} ${absolutePos[1]}`"
			/>
			<text class="label" :x="absolutePos[0] + 15" :y="absolutePos[1] - 10">
				{{ overlayLabel }}
			</text>
		</svg>
	</teleport>
</template>

<script lang="ts">
import {defineComponent, ref, PropType, computed} from 'vue'
import useDraggable from '@/components/use/use-draggable'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'

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
				.map(v => (v > 0 ? '+' : '') + v.toFixed(1))
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
	width $button-height
	height @width !important
	border-radius 2px
	background var(--button)
	input-transition(background)

	&:focus
		box-shadow 0 0 0 1px var(--highlight)

	&:hover, &.tweaking
		background var(--highlight)

	// Crosshair
	&:before, &:after
		pseudo-block()
		background var(--background) !important
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
</style>
