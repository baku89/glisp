<template>
	<div class="ListView" :class="{destructed: mode !== 'node'}">
		<div
			v-if="mode === 'node'"
			class="ListView__label"
			:class="{clickable: items.clickable, selected}"
			@click="items.clickable && onClick()"
		>
			<div class="ListView__icon" :class="{expanded}" @click="toggleExpanded()">
				<i
					v-if="items.icon.type === 'fontawesome'"
					class="fas"
					:class="items.icon.value"
					:style="items.icon.style"
				/>
				<span v-if="items.icon.type === 'text'" :style="items.icon.style">{{
					items.icon.value
				}}</span>
				<span
					class="serif"
					v-if="items.icon.type === 'serif'"
					:style="items.icon.style"
					>{{ items.icon.value }}</span
				>
			</div>
			{{ items.label }}
		</div>
		<div class="ListView__children" v-if="items.children && expanded">
			<ListView
				v-for="(child, i) in items.children"
				:key="i"
				:exp="child"
				:selectedExp="selectedExp"
				:editingExp="editingExp"
				@select="$emit('select', $event)"
				@update:exp="onUpdateChildExp"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal, isList, isVector, isSeq, MalType, getType} from '@/mal/types'
import {printExp} from '@/mal'

enum DisplayMode {
	Node = 'node',
	Elements = 'elements',
	Params = 'params'
}

interface Props {
	exp: NonReactive<MalVal>
	selectedExp: NonReactive<MalVal> | null
	editingExp: NonReactive<MalVal> | null
	mode: DisplayMode
}

const IconTexts = {
	[MalType.Function]: {type: 'serif', value: 'f'},
	[MalType.Number]: {type: 'text', value: '#'},
	[MalType.String]: {
		type: 'fontawesome',
		value: 'fa-quote-right',
		style: 'transform: scale(0.6);'
	},
	[MalType.Symbol]: {type: 'serif', value: 'x'},
	[MalType.Keyword]: {type: 'serif', value: 'x'}
} as {[type: string]: {type: string; value: string; style?: string}}

const M_UI_LISTVIEW_EXPANDED = Symbol.for('ui-listview-expanded')

export default defineComponent({
	name: 'ListView',
	props: {
		exp: {
			required: true
		},
		selectedExp: {
			required: true
		},
		editingExp: {
			required: true
		},
		mode: {
			default: DisplayMode.Node
		}
	},
	setup(props: Props, context) {
		const items = computed(() => {
			const exp = props.exp.value

			if (isList(exp)) {
				return {
					label: printExp(exp[0]),
					clickable: true,
					icon: {type: 'fontawesome', value: 'fa-chevron-right'},
					children: exp.slice(1).map(e => nonReactive(e))
				}
			} else if (isVector(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					icon: {type: 'text', value: '[ ]'}
				}
			} else {
				return {
					label: printExp(exp, false),
					clickable: false,
					icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
					children: null
				}
			}
		})

		const selected = computed(() => {
			return props.selectedExp && props.exp.value === props.selectedExp.value
		})

		function onClick() {
			context.emit('select', props.exp)
		}

		// List expansion
		const expanded = computed(() => {
			const exp = props.exp.value

			if (props.mode !== DisplayMode.Node) {
				return true
			}

			if (isList(exp)) {
				return !!(exp as any)[M_UI_LISTVIEW_EXPANDED]
			}

			return false
		})

		function toggleExpanded() {
			const exp = props.exp.value
			const expanded = !!(exp as any)[M_UI_LISTVIEW_EXPANDED]

			if (isSeq(exp)) {
				;(exp as any)[M_UI_LISTVIEW_EXPANDED] = !expanded
			}

			context.emit('update:exp', nonReactive(props.exp.value))
		}

		function onUpdateChildExp() {
			context.emit('update:exp', nonReactive(props.exp.value))
		}

		return {
			items,
			selected,
			onClick,
			expanded,
			toggleExpanded,
			onUpdateChildExp
		}
	}
})
</script>

<style lang="stylus">
.ListView
	padding-left 1rem
	width 100%
	user-select none

	&.destructed
		padding-left 0

		.ListView__children:before
			display none

	&__label
		position relative
		padding 0.5rem 1rem 0.4rem 0
		color var(--comment)
		text-overflow ellipsis
		white-space nowrap

		&.clickable
			color var(--foreground)
			cursor pointer

			&:after
				position absolute
				top 0
				right 0
				left -0.5rem
				height 100%
				background var(--yellow)
				content ''
				opacity 0
				transition opacity 0.05s ease
				pointer-events none

			&:hover
				color var(--highlight)

				&:after
					opacity 0.1

		&.selected
			font-weight bold

	&__icon
		display inline-block
		margin-right 0.2rem
		width 1rem
		color var(--comment)
		text-align center
		opacity 0.7
		transition all .15s ease

		&:hover
			opacity 1
			color var(--highlight)

		&.expanded
			transform rotate(90deg)

		.serif
			font-weight bold
			font-style italic
			font-family 'EB Garamond', serif
			line-height 1rem

	&__children
		position relative

		&:before
			position absolute
			top 0
			left 0.4rem
			width 0
			height 100%
			border-left 1px dotted var(--border)
			content ''
</style>
