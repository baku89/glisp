<template>
	<div class="ToolSelector">
		<Draggable
			tag="ul"
			class="ToolSelector__ui"
			v-model="toolEntires"
			v-bind="{animation: 100, ghostClass: 'ghost'}"
			itemKey="name"
		>
			<template #item="{element: {name, tool}}">
				<li
					class="ToolSelector__li"
					:class="{active: name === modelValue}"
					@click="$emit('update:modelValue', name)"
				>
					<SvgIcon class="ToolSelector__icon" v-html="tool.icon" />
					<span class="ToolSelector__label">
						{{ tool.label }}
					</span>
				</li>
			</template>
		</Draggable>
		<button class="ToolSelector__new" @click="duplicateCurrentTool">
			<SvgIcon mode="block" class="icon">
				<path d="M16 2 L16 30 M2 16 L30 16" />
			</SvgIcon>
		</button>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, toRaw} from 'vue'
import Draggable from 'vuedraggable'

import SvgIcon from '@/components/layouts/SvgIcon.vue'

import {BrushDefinition} from './brush-definition'
export default defineComponent({
	name: 'ToolSelector',
	components: {SvgIcon, Draggable},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		tools: {
			type: Object as PropType<Record<string, BrushDefinition>>,
			required: true,
		},
	},
	emits: ['update:modelValue', 'update:tools'],
	setup(props, context) {
		const toolEntires = computed<{name: string; tool: BrushDefinition}[]>({
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

		return {toolEntires, duplicateCurrentTool}
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

			.ToolSelector__label
				margin-left 0.5em
				opacity 1 !important

	&__icon
		display block !important
		flex-grow 1
		margin 0.25em
		width 100%
		height 100%
		font-size 2em

	&__label
		position absolute
		top 50%
		left 100%
		margin-left 0em
		transform translateY(-50%)
		tooltip()
		color base16('04')
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
