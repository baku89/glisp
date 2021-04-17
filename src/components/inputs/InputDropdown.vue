<template>
	<div class="InputDropdown" :class="{open}" ref="rootEl" v-bind="$attrs">
		<InputString
			class="InputDropdown__input"
			:modelValue="activeLabel"
			@update:modelValue="onInput"
			@focus="onFocus"
			@blur="onBlur"
			@keydown="onKeydown"
		/>
		<SvgIcon mode="block" class="InputDropdown__chevron">
			<path d="M11 13 L16 18 21 13" />
		</SvgIcon>
	</div>
	<Popover
		:open="open"
		@update:open="onClickOutsideOfPopover"
		:reference="rootEl"
		placement="bottom"
	>
		<ul
			class="InputDropdown__select"
			:style="{width: rootWidth + 'px'}"
			:value="modelValue"
			@change="onChange"
		>
			<li
				class="InputDropdown__option"
				:class="{active: value === modelValue}"
				v-for="{value, label} in items"
				:key="value"
				:value="value"
				@click="onSelect(value)"
			>
				{{ label }}
			</li>
		</ul>
	</Popover>
</template>

<script lang="ts">
import {useElementSize} from '@vueuse/core'
import fuzzy from 'fuzzy'
import keycode from 'keycode'
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import _$ from '@/lodash-ext'

console.log(fuzzy)

export default defineComponent({
	name: 'InputDropdown',
	components: {InputString, Popover, SvgIcon},
	props: {
		modelValue: {
			type: String as PropType<string>,
			required: true,
		},
		values: {
			type: Array as PropType<string[]>,
			required: true,
		},
		labels: {
			type: Array as PropType<string[]>,
			required: false,
		},
		capitalize: {
			type: Boolean,
			default: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const open = ref(false)
		const rootEl = ref<null | HTMLInputElement>(null)

		const inputFocused = ref(false)
		const filteredIndices = ref<null | number[]>(null)
		const {width: rootWidth} = useElementSize(rootEl)

		const computedLabels = computed(
			() =>
				props.labels ||
				(props.capitalize ? props.values.map(_.capitalize) : props.values)
		)

		// Pair of all value and label
		const items = computed(() =>
			_$.zipShorter(
				props.values,
				computedLabels.value
			).map(([value, label]) => ({value, label}))
		)

		const activeIndex = computed(() => props.values.indexOf(props.modelValue))
		const activeLabel = computed(() => computedLabels.value[activeIndex.value])

		function onFocus(e: InputEvent) {
			const input = e.target as HTMLInputElement

			input.focus()
			input.select()

			open.value = true
			inputFocused.value = true
		}

		function onBlur() {
			inputFocused.value = false
			filteredIndices.value = null
		}

		function onKeydown(e: KeyboardEvent) {
			const key = keycode(e)

			switch (key) {
				case 'enter':
					context.emit('update:modelValue', props.modelValue)
					break
				case 'up': {
					const len = props.values.length
					const index = (activeIndex.value - 1 + len) % len
					const newValue = props.values[index]
					context.emit('update:modelValue', newValue)
					break
				}
				case 'down': {
					const index = (activeIndex.value + 1) % props.values.length
					const newValue = props.values[index]
					context.emit('update:modelValue', newValue)
					break
				}
			}
		}

		function onInput(value: string) {
			filteredIndices.value = fuzzy
				.filter(value, computedLabels.value)
				.map(v => v.index)
		}

		function onSelect(newValue: string | number) {
			context.emit('update:modelValue', newValue)
			open.value = false
		}

		function onClickOutsideOfPopover() {
			setTimeout(() => {
				if (!inputFocused.value) {
					open.value = false
				}
			}, 0)
		}

		return {
			rootEl,
			rootWidth,
			items,

			computedLabels,
			activeLabel,
			filteredIndices,

			open,

			onFocus,
			onBlur,
			onInput,
			onKeydown,
			onSelect,
			onClickOutsideOfPopover,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	display inline-block
	width 6em

	&__input
		width 100%
		cursor default

	&__select
		margin 2px
		color var(--base06)
		tooltip()
		padding 0
		border 1px solid var(--frame)
		user-select none

	&__option
		padding 0 0.4rem
		line-height $input-height
		hieght $input-height
		translucent-bg()
		input-transition()

		&:hover
			background base16('01')
			color var(--accent)

		&.active
			background var(--accent)
			color base16('00')

	&__chevron
		position absolute
		top 0
		right -0.4em
		height 100%
		transform-origin 50% 50%
		pointer-events none
		fill none
		stroke var(--base04)
		input-transition(transform)

		~/.open &
			transform rotate(180deg)

	&.simple
		text-align-last center
</style>
