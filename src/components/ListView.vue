<template>
	<div class="ListView">
		<div
			class="ListView__label"
			:class="{clickable: items.clickable, selected}"
			@click="items.clickable && onClick()"
		>
			<div
				class="ListView__icon"
				:class="{expanded, expandable: items.expandable}"
				@click="items.expandable && toggleExpanded()"
			>
				<i
					v-if="items.icon.type === 'fontawesome'"
					class="fas"
					:class="items.icon.value"
					:style="items.icon.style"
				/>
				<span v-else-if="items.icon.type === 'text'" :style="items.icon.style">
					{{ items.icon.value }}
				</span>
				<span
					class="serif"
					v-if="items.icon.type === 'serif'"
					:style="items.icon.style"
					>{{ items.icon.value }}</span
				>
			</div>
			{{ items.label }}
			<i
				class="ListView__editing fas fa-code"
				:class="{active: exp.value === editingExp.value}"
				@click="onClickEditIcon"
			/>
		</div>
		<div class="ListView__children" v-if="items.children && expanded">
			<ListView
				v-for="(child, i) in items.children"
				:key="i"
				:exp="child"
				:selectedExp="selectedExp"
				:editingExp="editingExp"
				@select="$emit('select', $event)"
				@update:exp="onUpdateChildExp(i, $event)"
				@update:editingExp="$emit('update:editingExp', $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {
	MalVal,
	isList,
	isVector,
	MalType,
	getType,
	symbolFor as S,
	keywordFor as K,
	MalMap,
	createList as L,
	MalNode,
	MalSeq
} from '@/mal/types'
import {printExp} from '@/mal'
import {replaceExp} from '../mal/eval'
import {reconstructTree} from '@/mal/reader'

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

const S_UI_ANNOTATE = S('ui-annotate')
const K_NAME = K('name')
const K_EXPANDED = K('expanded')

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
		/**
		 * The flag whether the exp has UI annotaiton
		 */
		const hasAnnotation = computed(() => {
			const exp = props.exp.value
			return isList(exp) && exp[0] === S_UI_ANNOTATE
		})

		/**
		 * the body of expression withouht ui-annotate wrapping
		 */
		const expBody = computed(() => {
			const exp = props.exp.value
			if (hasAnnotation.value) {
				return nonReactive((exp as MalSeq)[2])
			} else {
				return props.exp
			}
		})

		/**
		 * UI Annotations
		 */
		const ui = computed(() => {
			const exp = props.exp.value
			if (hasAnnotation.value) {
				const info = (exp as MalSeq)[1] as MalMap
				return {name: info[K_NAME] || null, expanded: info[K_EXPANDED] || false}
			}

			return {name: null, expanded: false}
		})

		const items = computed(() => {
			const exp = expBody.value.value

			if (isList(exp)) {
				return {
					label: printExp(exp[0]),
					clickable: props.mode === DisplayMode.Node,
					expandable: props.mode === DisplayMode.Node,
					icon: {type: 'fontawesome', value: 'fa-chevron-right'},
					children: exp.slice(1).map(e => nonReactive(e))
				}
			} else if (isVector(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					expandable: false,
					icon: {type: 'text', value: '[ ]'},
					children: null
				}
			} else {
				return {
					label: printExp(exp, false),
					clickable: false,
					expandable: false,
					icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
					children: null
				}
			}
		})

		const expanded = computed(() => {
			return props.mode !== DisplayMode.Node
				? true
				: items.value.expandable
				? ui.value.expanded
				: false
		})

		const selected = computed(() => {
			return (
				props.selectedExp && expBody.value.value === props.selectedExp.value
			)
		})

		function onClick() {
			context.emit('select', expBody.value)
		}

		function toggleExpanded() {
			const annotation = {} as {[k: string]: MalVal}
			if (!ui.value.expanded === true) {
				annotation[K_EXPANDED] = true
			}
			if (ui.value.name !== null) {
				annotation[K_NAME] = ui.value.name
			}

			const newExp = nonReactive(
				Object.keys(annotation).length > 0
					? L(S_UI_ANNOTATE, annotation, expBody.value.value)
					: expBody.value.value
			)

			context.emit('update:exp', newExp)
			if (
				props.editingExp?.value === props.exp.value &&
				props.editingExp?.value !== newExp.value
			) {
				context.emit('update:editingExp', newExp)
			}
		}

		function onUpdateChildExp(i: number, replaced: NonReactive<MalNode>) {
			const exp = props.exp.value as MalSeq

			replaceExp(
				(expBody.value.value as MalSeq)[i + 1] as MalNode,
				replaced.value
			)

			let newExp

			if (hasAnnotation.value) {
				newExp = L(S_UI_ANNOTATE, exp[1], expBody.value.value)
			} else {
				newExp = expBody.value.value
			}

			reconstructTree(newExp)

			context.emit('update:exp', nonReactive(newExp))
		}

		function onClickEditIcon(e: MouseEvent) {
			e.stopPropagation()
			context.emit('update:editingExp', props.exp)
		}

		return {
			items,
			selected,
			onClick,
			expanded,
			ui,
			toggleExpanded,
			onUpdateChildExp,
			onClickEditIcon
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
		transition all 0.15s ease

		&.expandable:hover
			color var(--highlight)
			opacity 1

		&.expanded
			transform rotate(90deg)

		.serif
			font-weight bold
			font-style italic
			font-family 'EB Garamond', serif
			line-height 1rem

	&__editing
		position absolute
		right 1rem
		color var(--comment)
		opacity 0
		cursor pointer

		&:hover
			opacity 0.5

		&.active
			opacity 0.7

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
