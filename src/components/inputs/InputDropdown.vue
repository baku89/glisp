<template>
	<div class="InputDropdown" :class="{open}" ref="rootEl" v-bind="$attrs">
		<InputString
			class="InputDropdown__input"
			:modelValue="display"
			:selectOnFocus="true"
			@update:modelValue="onInput"
			@click="open = true"
			@focus="onFocus"
			@blur="onBlur"
			@keydown.enter="onEnter"
			@keydown.up.prevent="onPressUpDown('up')"
			@keydown.down.prevent="onPressUpDown('down')"
		/>
		<SvgIcon mode="block" class="InputDropdown__chevron">
			<path d="M11 13 L16 18 21 13" />
		</SvgIcon>
	</div>
	<Popover
		:open="open"
		@update:open="onBlur"
		:reference="rootEl"
		placement="bottom"
	>
		<ul class="InputDropdown__select" :style="{width: inputWidth + 'px'}">
			<li
				class="InputDropdown__option"
				v-for="{index, html, item} in filtered"
				:class="{
					active: item.value === model,
					hover: item.value === local,
				}"
				:key="index"
				@mousedown="onSelect(item, 'click')"
				@mouseenter="onSelect(item, 'hover')"
			>
				<slot name="option" :string="html" :value="item.value">
					<div class="style-default" v-html="html" />
				</slot>
			</li>
		</ul>
	</Popover>
</template>

<script lang="ts">
import {useElementSize} from '@vueuse/core'
import fuzzy from 'fuzzy'
import _ from 'lodash'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import useLocalModelValue from '@/components/use/use-local-model-value'
import {unsignedMod} from '@/utils'

type Value = any

interface Item {
	index: number
	value: Value
	label: string
}

interface ItemProp {
	value: Value
	label?: string
}

interface Filtered {
	html: string
	item: Item
}

type ILabelizer = (v: any) => string

type Primitives = string | number | boolean | null | symbol

export default defineComponent({
	name: 'InputDropdown',
	components: {InputString, Popover, SvgIcon},
	props: {
		modelValue: {
			required: true,
		},
		items: {
			type: [String, Array] as PropType<string | (ItemProp | Primitives)[]>,
			required: true,
		},
		labelize: {
			type: Function as PropType<ILabelizer>,
			default: (v: any) => v + '',
		},
		updateOnBlur: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['update:modelValue'],
	setup(props, {emit}) {
		const {local, model} = useLocalModelValue(props, emit)

		const open = ref(false)
		const rootEl = ref<null | HTMLInputElement>(null)

		const {width: inputWidth} = useElementSize(rootEl)

		const itemsData = computed<Item[]>(() => {
			const items = props.items
			const arrItems = _.isArray(items) ? items : items.split(',')

			return arrItems.map((it, index) => {
				if (!_.isObject(it)) {
					return {index, value: it, label: props.labelize(it)}
				} else {
					return {
						index,
						value: it.value,
						label: it.label ?? props.labelize(it.value),
					}
				}
			})
		})

		const activeIndex = computed(() =>
			itemsData.value.findIndex(it => it.value === local.value)
		)
		const activeItem = computed(
			() => itemsData.value[activeIndex.value] ?? null
		)

		const filtered = ref(getNotFiltered())

		function getNotFiltered() {
			return itemsData.value.map(item => {
				return {
					html: item.label,
					item,
				} as Filtered
			})
		}

		const display = ref(activeItem.value ? activeItem.value.label : '')
		const inputFocused = ref(false)

		watch(
			activeItem,
			() => {
				if (activeItem.value && !inputFocused.value) {
					display.value = activeItem.value.label
				}
			},
			{flush: 'post'}
		)

		function onFocus() {
			open.value = true
			inputFocused.value = true
			filtered.value = getNotFiltered()
		}

		function onBlur() {
			inputFocused.value = false
			open.value = false

			if (activeItem.value) {
				model.value = activeItem.value.value
			}
		}

		function onEnter() {
			open.value = !open.value

			if (activeItem.value) {
				display.value = activeItem.value.label
				model.value = activeItem.value.value
				filtered.value = getNotFiltered()
			}
		}

		function onPressUpDown(dir: 'up' | 'down') {
			const indices = filtered.value.map(ret => ret.item.index)
			let notSelected = !filtered.value.find(
				ret => ret.item === activeItem.value
			)
			const len = indices.length

			const defaultIndex = dir === 'up' ? 0 : len - 1
			const inc = dir === 'up' ? -1 : +1
			const index = notSelected
				? defaultIndex
				: indices.indexOf(activeIndex.value)
			const neighborIndex = indices[unsignedMod(index + inc, len)]
			const {label, value} = itemsData.value[neighborIndex]

			display.value = label
			local.value = value
		}

		function onInput(value: string) {
			open.value = true
			display.value = value

			const result = fuzzy.filter(value, itemsData.value, {
				extract: it => it.label,
				pre: '<u>',
				post: '</u>',
			})

			if (result.length === 0) {
				filtered.value = getNotFiltered()
			} else {
				filtered.value = result.map(({index, string, original}) => ({
					index,
					html: string,
					item: original,
				}))
			}

			// Select the first of filtered items if no item is selected

			let notSelected = !filtered.value.find(
				ret => ret.item === activeItem.value
			)

			if (notSelected) {
				local.value = filtered.value[0].item.value
			}
		}

		function onSelect({value, label}: Item, eventType: 'hover' | 'click') {
			if (eventType === 'click' || !props.updateOnBlur) {
				model.value = value
			}

			if (eventType === 'hover') {
				local.value = value
			}

			if (eventType === 'click') {
				open.value = false
				display.value = label
			}
		}

		return {
			local,
			model,
			rootEl,
			inputWidth,
			display,
			itemsData,
			activeItem,
			filtered,
			open,
			onFocus,
			onBlur,
			onInput,
			onEnter,
			onPressUpDown,
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
	height $input-height

	&__input
		width 100%
		cursor default

	&__select
		margin 2px
		tooltip()
		padding 0
		border 1px solid $color-frame
		user-select none

	&__option .style-default
		padding 0 0.4rem
		height $input-height
		line-height $input-height
		glass-bg('pane')

	&__option.hover .style-default
		background base16('02')

	&__option.active .style-default
		background base16('accent')
		color base16('00')

	&__chevron
		position absolute
		top 0
		right -0.4em
		height 100%
		transform-origin 50% 50%
		pointer-events none
		fill none
		stroke base16('04')
		input-transition(transform)

		~/.open &
			transform scaleY(180deg)

	&.simple
		text-align-last center
</style>
