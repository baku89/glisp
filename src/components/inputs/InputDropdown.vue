<template>
	<div class="InputDropdown" ref="rootEl" v-bind="$attrs">
		<InputString
			class="InputDropdown__input"
			:modelValue="activeLabel"
			@focus="onFocus"
			@blur="opened = opened"
			@change="onInput"
		/>
		<SvgIcon mode="block" class="InputDropdown__chevron">
			<path d="M30 12 L16 24 2 12" />
		</SvgIcon>
	</div>
	<Popover v-model:open="opened" :reference="rootEl" placement="bottom">
		<ul
			class="InputDropdown__select"
			:style="{width: rootWidth + 'px'}"
			:value="modelValue"
			@change="onChange"
		>
			<li
				class="InputDropdown__option"
				:class="{active: value === modelValue}"
				v-for="([value, label], index) in pairs"
				:key="index"
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
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/SvgIcon.vue'

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
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const opened = ref(false)
		const rootEl = ref<null | HTMLInputElement>(null)

		const {width: rootWidth} = useElementSize(rootEl)

		const activeLabel = computed(() => {
			if (props.labels) {
				return props.labels[props.values.indexOf(props.modelValue)]
			} else {
				return props.modelValue
			}
		})

		const pairs = computed(() => {
			if (props.labels) {
				return _.zip(props.values, props.labels)
			} else {
				return props.values.map(v => [v, _.capitalize(v.toString())])
			}
		})

		function onFocus(e: InputEvent) {
			const input = e.target as HTMLInputElement

			input.focus()
			input.select()

			opened.value = true
		}

		function onInput() {
			return ''
		}

		function onSelect(newValue: string | number) {
			context.emit('update:modelValue', newValue)
			opened.value = false
		}

		return {
			rootEl,
			rootWidth,

			activeLabel,

			pairs,
			opened,

			onFocus,
			onInput,
			onSelect,
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

		&.active
			background var(--accent)
			color base16('00')

		&:hover
			background base16('01')
			color var(--accent)

	&__chevron
		position absolute
		top 0
		right 0
		height 100%
		transform scale(0.4)
		transform-origin 80% 50%
		pointer-events none
		fill none
		stroke var(--base04)
		stroke-width 4 !important

	&.simple
		text-align-last center
</style>
