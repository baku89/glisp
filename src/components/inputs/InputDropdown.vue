<template>
	<div class="InputDropdown" :class="{open}" ref="rootEl" v-bind="$attrs">
		<InputString
			class="InputDropdown__input"
			:modelValue="inputValue"
			@update:modelValue="onInput"
			@click="open = true"
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
				:class="{active: completeItems[index].value === modelValue}"
				v-for="{index, string, original: {value}} in filteredResults"
				:key="index"
				@click="onSelect(value)"
				v-html="string"
			/>
		</ul>
	</Popover>
</template>

<script lang="ts">
import {useElementSize, useMagicKeys} from '@vueuse/core'
import fuzzy from 'fuzzy'
import keycode from 'keycode'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import {unsignedMod} from '@/utils'

interface Item {
	value: any
	label?: string
}

interface CompleteItem {
	value: any
	label: string
}

interface FilteredResult {
	index: number
	string: string
	original: CompleteItem
}

type ILabelizer = (v: any) => string

export default defineComponent({
	name: 'InputDropdown',
	components: {InputString, Popover, SvgIcon},
	props: {
		modelValue: {
			required: true,
		},
		items: {
			type: Array as PropType<(Item | string | number | boolean | null)[]>,
			required: true,
		},
		labelize: {
			type: Function as PropType<ILabelizer>,
			default: (v: any) => v + '',
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const open = ref(false)
		const rootEl = ref<null | HTMLInputElement>(null)

		const {width: rootWidth} = useElementSize(rootEl)

		const completeItems = computed<CompleteItem[]>(() => {
			return props.items.map(it => {
				if (typeof it !== 'object' || it === null) {
					return {value: it, label: props.labelize(it)}
				}
				if (!it.label) {
					return {value: it.value, label: props.labelize(it.value)}
				}
				return it as CompleteItem
			})
		})

		const filteredResults = ref(getNotFilteredResults())

		function getNotFilteredResults() {
			return completeItems.value.map((item, index) => {
				return {
					index,
					string: item.label,
					original: item,
				} as FilteredResult
			})
		}

		const activeItem = computed(() => {
			return completeItems.value.find(it => it.value === props.modelValue)
		})

		const inputValue = ref(activeItem.value ? activeItem.value.label : '')
		const inputFocused = ref(false)

		watch(activeItem, () => {
			if (activeItem.value && !inputFocused.value) {
				inputValue.value = activeItem.value.label
			}
		})

		function onFocus(e: InputEvent) {
			const input = e.target as HTMLInputElement

			input.focus()
			input.select()

			open.value = true
			inputFocused.value = true
			filteredResults.value = getNotFilteredResults()
		}

		const {tab} = useMagicKeys()

		function onBlur() {
			if (activeItem.value && !open.value) {
				inputValue.value = activeItem.value.label
			}
			inputFocused.value = false

			if (tab.value) {
				open.value = false
			}
		}

		function onKeydown(e: InputEvent) {
			open.value = true

			const key = keycode(e)

			const indices = filteredResults.value.map(ret => ret.index)
			const activeIndex = completeItems.value.findIndex(
				it => it.value === props.modelValue
			)
			let notSelected =
				activeIndex === -1 ||
				filteredResults.value.findIndex(ret => ret.index === activeIndex) === -1
			const len = indices.length

			switch (key) {
				case 'enter':
					if (activeItem.value) {
						inputValue.value = activeItem.value.label
						open.value = false
					}
					break
				case 'up': {
					const index = notSelected ? 0 : indices.indexOf(activeIndex)
					const prevIndex = indices[unsignedMod(index - 1, len)]
					const item = completeItems.value[prevIndex]
					context.emit('update:modelValue', item.value)
					inputValue.value = item.label
					break
				}
				case 'down': {
					const index = notSelected
						? indices.length - 1
						: indices.indexOf(activeIndex)
					const nextIndex = indices[unsignedMod(index + 1, len)]
					const item = completeItems.value[nextIndex]
					context.emit('update:modelValue', item.value)
					inputValue.value = item.label
					break
				}
			}
		}

		function onInput(value: string) {
			inputValue.value = value

			const result = fuzzy.filter(value, completeItems.value, {
				extract: it => it.label,
				pre: '<u>',
				post: '</u>',
			})

			if (result.length === 0) {
				filteredResults.value = getNotFilteredResults()
			} else {
				filteredResults.value = result.map(({index, string, original}) => {
					return {
						index,
						string,
						original,
					}
				})
			}

			// Select the first of filtered items if no item is selected
			const activeIndex = completeItems.value.findIndex(
				it => it.value === props.modelValue
			)

			let notSelected =
				activeIndex === -1 ||
				filteredResults.value.findIndex(ret => ret.index === activeIndex) === -1

			if (notSelected) {
				const item = completeItems.value[filteredResults.value[0].index]
				context.emit('update:modelValue', item.value)
			}
		}

		function onSelect(newValue: string | number) {
			context.emit('update:modelValue', newValue)
			open.value = false
		}

		function onClickOutsideOfPopover() {
			setTimeout(() => {
				if (!inputFocused.value) {
					open.value = false
					if (activeItem.value) {
						inputValue.value = activeItem.value.label
					}
				}
			}, 0)
		}

		return {
			rootEl,
			rootWidth,
			inputValue,
			completeItems,
			activeItem,
			filteredResults,
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
