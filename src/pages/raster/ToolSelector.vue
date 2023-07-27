<template>
	<div class="ToolSelector" v-bind="$attrs">
		<Draggable
			tag="ul"
			v-model="toolEntries"
			ghost-class="ghost"
			:animation="100"
			:touchStartThreshold="10"
			:delayOnTouchOnly="true"
			:delay="300"
			itemKey="name"
		>
			<template #item="{element: {name, tool}, index}">
				<li
					class="ToolSelector__li"
					:class="{
						active: name === modelValue,
						contextmenu: index === contextmenuIndex,
					}"
					@click="$emit('update:modelValue', name)"
					@contextmenu.prevent="contextmenuIndex = index"
					:ref="
						el => {
							if (el) items[index] = el
						}
					"
				>
					<SvgIcon class="ToolSelector__icon" v-html="tool.icon" />
					<span class="ToolSelector__label">
						{{ tool.label }}
					</span>
				</li>
			</template>
		</Draggable>
		<button v-if="isPC" class="ToolSelector__new" @click="duplicateCurrentTool">
			<SvgIcon mode="block" class="icon">
				<path d="M16 2 L16 30 M2 16 L30 16" />
			</SvgIcon>
		</button>
	</div>
	<Popover
		:open="contextmenuIndex !== null"
		@update:open="contextmenuIndex = null"
		:reference="items[contextmenuIndex]"
		placement="right-start"
	>
		<Menu :menu="contextmenuItems" />
	</Popover>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import Menu, {MenuItem} from '@/components/layouts/Menu.vue'
import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import {BrushDefinition} from './brush-definition'
export default defineComponent({
	name: 'ToolSelector',
	components: {Menu, Draggable, SvgIcon, Popover},
	props: {
		modelValue: {
			type: String,
			default: null,
		},
		tools: {
			type: Object as PropType<Record<string, BrushDefinition>>,
			required: true,
		},
		contextmenu: {
			type: Array as PropType<MenuItem[]>,
			default: () => [],
		},
	},
	emits: ['update:modelValue', 'update:tools'],
	inheritAttrs: false,
	setup(props, context) {
		const toolEntries = computed<{name: string; tool: BrushDefinition}[]>({
			get() {
				return _.entries(props.tools).map(([name, tool]) => ({name, tool}))
			},
			set(sorted) {
				const newValue = _.fromPairs(sorted.map(({name, tool}) => [name, tool]))
				context.emit('update:tools', newValue)
			},
		})

		function duplicateCurrentTool() {
			const tools = toRaw(props.tools)

			const name = props.modelValue + '_copy'
			const tool = _.cloneDeep(tools[props.modelValue])
			tool.label += ' Copy'

			context.emit('update:tools', {...tools, [name]: tool})
			context.emit('update:modelValue', name)
		}

		// Context menu
		const items = ref([])
		const contextmenuIndex = ref<number | null>(null)
		const contextmenuItems = computed<MenuItem[]>(() => {
			return [
				...props.contextmenu.map(m => ({
					...m,
					exec: () => {
						if (contextmenuIndex.value !== null)
							m.exec(toolEntries.value[contextmenuIndex.value].name)

						contextmenuIndex.value = null
					},
				})),
				{
					name: 'delete',
					label: 'Delete',
					icon: '<path d="M28 6 L6 6 8 30 24 30 26 6 4 6 M16 12 L16 24 M21 12 L20 24 M11 12 L12 24 M12 6 L13 2 19 2 20 6" />',
					exec() {
						const index = contextmenuIndex.value
						if (index === null) return

						const tools = [...toolEntries.value]

						// Also update the tool's name when deleting the active tool
						if (props.modelValue === tools[index].name) {
							const toolCount = toolEntries.value.length
							const newValue =
								toolCount > 1
									? tools[Math.min(index + 1, toolCount - 1)].name
									: null
							context.emit('update:modelValue', newValue)
						}

						tools.splice(index, 1)
						toolEntries.value = tools // Emits update:tools

						contextmenuIndex.value = null
					},
				},
			]
		})

		return {
			toolEntries,
			duplicateCurrentTool,

			items,
			contextmenuIndex,
			contextmenuItems,
			isPC: navigator.maxTouchPoints === 0,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

$size = 3em

.ToolSelector
	display flex
	flex-direction column
	width $size

	&__li
		position relative
		width $size
		height $size
		border 1px solid $color-frame
		color base16('04')
		cursor pointer
		glass-bg('pane')

		&.ghost
			visibility hidden

		&:first-child
			border-top-left-radius $popup-round
			border-top-right-radius $popup-round

		&:last-child
			border-bottom-right-radius $popup-round
			border-bottom-left-radius $popup-round

		&:not(:last-child)
			border-bottom none

		&.active
			background base16('accent')
			color base16('00')

		&:not(.active):hover
			color base16('accent')

		&:not(.contextmenu):hover, &:not(.contextmenu).active
			.ToolSelector__label
				margin-left 0.5em
				opacity 1 !important

	&__icon
		display block !important
		flex-grow 1
		margin 0.25em
		font-size 2em

	&__label
		position absolute
		top 50%
		left 100%
		margin-left 0em
		transform translateY(-50%)
		tooltip()
		color base16('05')
		opacity 0
		pointer-events none
		input-transition(all)
		width max-content

	&__new
		margin: ($size * 0.15)
		width: $size * 0.7
		height: $size * 0.7
		border 1px solid $color-frame
		border-radius 50%
		color base16('04')
		glass-bg('float')
		input-transition(all)
		opacity 0
		cursor pointer

		& > .icon
			margin 23%
			width 50%
			height 50%

		&:hover
			border-color base16('accent')
			background base16('accent')
			color base16('00')

		~/:hover &
			opacity 1
			transform translateY(10%)
</style>
