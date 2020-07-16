<template>
	<div class="ListView">
		<div
			class="ListView__label"
			:class="{clickable: labelInfo.clickable, selected, hovering}"
			@click="labelInfo.clickable && onClick()"
			@dblclick="labelInfo.editable && onClickEditButton($event)"
		>
			<div
				class="ListView__icon"
				:class="{expanded, expandable: labelInfo.expandable}"
				@click="labelInfo.expandable && toggleExpanded()"
			>
				<i
					v-if="labelInfo.icon.type === 'fontawesome'"
					:class="labelInfo.icon.value"
					:style="labelInfo.icon.style"
				/>
				<span
					v-else-if="labelInfo.icon.type === 'text'"
					:style="labelInfo.icon.style"
				>{{ labelInfo.icon.value }}</span>
				<span
					class="serif"
					v-if="labelInfo.icon.type === 'serif'"
					:style="labelInfo.icon.style"
				>{{ labelInfo.icon.value }}</span>
			</div>
			{{ labelInfo.label }}
			<i
				v-if="labelInfo.editable"
				class="ListView__editing fas fa-code"
				:class="{active: exp.value === editingExp.value}"
				@click="onClickEditButton"
			/>
		</div>
		<div class="ListView__children" v-if="labelInfo.children && expanded">
			<ListView
				v-for="(child, i) in labelInfo.children"
				:key="i"
				:exp="child"
				:selectedExp="selectedExp"
				:editingExp="editingExp"
				:hoveringExp="hoveringExp"
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
	MalSeq,
	isSymbolFor,
	isMap
} from '@/mal/types'
import {printExp} from '@/mal'
import {replaceExp} from '@/mal/utils'
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
	hoveringExp: NonReactive<MalVal> | null
	mode: DisplayMode
}

const IconTexts = {
	[MalType.Function]: {type: 'serif', value: 'f'},
	[MalType.Number]: {type: 'text', value: '#'},
	[MalType.String]: {
		type: 'fontawesome',
		value: 'fas fa-quote-right',
		style: 'transform: scale(0.6);'
	},
	[MalType.Symbol]: {type: 'serif', value: 'x'},
	[MalType.Keyword]: {type: 'fontawesome', value: 'fas fa-key'}
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
		hoveringExp: {
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
			return isList(exp) && isSymbolFor(exp[0], 'ui-annotate')
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

		const labelInfo = computed(() => {
			const exp = expBody.value.value

			if (isList(exp)) {
				return {
					label: exp[0] ? printExp(exp[0]) : '<empty>',
					clickable: props.mode === DisplayMode.Node,
					expandable: props.mode === DisplayMode.Node,
					editable: true,
					icon: {
						type: 'fontawesome',
						value: 'fas fa-chevron-right',
						style: 'transform: scale(.8)'
					},
					children: exp.slice(1).map(e => nonReactive(e))
				}
			} else if (isVector(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					expandable: false,
					editable: true,
					icon: {type: 'text', value: '[ ]'},
					children: null
				}
			} else if (isMap(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					expandable: false,
					editable: true,
					icon: {type: 'fontawesome', value: 'far fa-map'},
					children: null
				}
			} else {
				return {
					label: printExp(exp, false),
					clickable: false,
					expandable: false,
					editable: false,
					icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
					children: null
				}
			}
		})

		const expanded = computed(() => {
			return props.mode !== DisplayMode.Node
				? true
				: labelInfo.value.expandable
				? ui.value.expanded
				: false
		})

		const selected = computed(() => {
			return (
				props.selectedExp && expBody.value.value === props.selectedExp.value
			)
		})

		const hovering = computed(() => {
			return (
				props.hoveringExp && expBody.value.value === props.hoveringExp.value
			)
		})

		/**
		 * Events
		 */
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

		function onClickEditButton(e: MouseEvent) {
			e.stopPropagation()
			context.emit('update:editingExp', props.exp)
		}

		return {
			labelInfo,
			selected,
			hovering,
			onClick,
			expanded,
			ui,
			toggleExpanded,
			onUpdateChildExp,
			onClickEditButton
		}
	}
})
</script>

<style lang="stylus">
.ListView
	overflow hidden
	// padding-left 1rem
	width 100%
	user-select none

	&.destructed
		padding-left 0

		.ListView__children:before
			display none

	&__label
		position relative
		overflow hidden
		padding 0.5rem 0.5rem 0.4rem 0.3rem
		color var(--comment)
		text-overflow ellipsis
		white-space nowrap

		&:after
			position absolute
			top 0
			right 0
			left 0rem
			height 100%
			content ''
			opacity 0
			transition opacity 0.05s ease
			pointer-events none

		&:hover
			&:after
				opacity 0.15

		&.clickable
			color var(--foreground)
			cursor pointer

			&:hover
				color var(--highlight)

			&:after
				border 1px solid var(--highlight)

		&.selected
			color var(--highlight)
			font-weight bold

			&:after
				background var(--highlight)
				opacity 0.15

		&.hovering
			color var(--highlight)

			&:after
				border 1px solid var(--highlight)
				opacity 0.15

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
		padding-left 1rem

		&:before
			position absolute
			top 0
			left 0.8rem
			width 0
			height 100%
			border-left 1px dotted var(--border)
			content ''
</style>
