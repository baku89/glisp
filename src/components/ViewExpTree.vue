<template>
	<div class="ViewExpTree">
		<div
			:class="{
				clickable: labelInfo.clickable,
				hidden: ui.hidden,
				active,
				selected,
				hovering,
			}"
			@click="labelInfo.clickable && onClick($event)"
			class="ViewExpTree__label"
		>
			<div
				:class="{expanded, expandable: labelInfo.expandable}"
				@click="labelInfo.expandable && toggleExpanded()"
				class="ViewExpTree__icon"
			>
				<i
					:class="labelInfo.icon.value"
					:style="labelInfo.icon.style"
					v-if="labelInfo.icon.type === 'fontawesome'"
				/>
				<span
					:style="labelInfo.icon.style"
					v-else-if="labelInfo.icon.type === 'text'"
					>{{ labelInfo.icon.value }}</span
				>
				<span
					:style="labelInfo.icon.style"
					class="serif"
					v-if="labelInfo.icon.type === 'serif'"
					>{{ labelInfo.icon.value }}</span
				>
			</div>
			{{ labelInfo.label }}
			<i
				:class="{active: editing}"
				@click="onClickEditButton"
				class="ViewExpTree__editing fas fa-code"
				v-if="labelInfo.editable"
			/>
		</div>
		<div class="ViewExpTree__children" v-if="labelInfo.children && expanded">
			<ViewExpTree
				:active-exp="activeExp"
				:editing-exp="editingExp"
				:exp="child"
				:expSelection="expSelection"
				:hovering-exp="hoveringExp"
				:key="i"
				@select="$emit('select', $event)"
				@toggle-selection="$emit('toggle-selection', $event)"
				@update:editing-exp="$emit('update:editing-exp', $event)"
				@update:exp="onUpdateChildExp(i, $event)"
				v-for="(child, i) in labelInfo.children"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import {
	MalVal,
	isList,
	isVector,
	MalType,
	getType,
	MalSymbol,
	MalKeyword,
	MalMap,
	MalList,
	MalNode,
	MalSeq,
	isMap,
	cloneExp,
} from '@/mal/types'
import {printExp} from '@/mal'
import {reconstructTree} from '@/mal/reader'
import {isUIAnnotation} from '@/mal/utils'

enum DisplayMode {
	Node = 'node',
	Elements = 'elements',
}

const IconTexts = {
	[MalType.Function]: {type: 'serif', value: 'f'},
	[MalType.Number]: {type: 'text', value: '#'},
	[MalType.String]: {
		type: 'fontawesome',
		value: 'fas fa-quote-right',
		style: 'transform: scale(0.6);',
	},
	[MalType.Symbol]: {type: 'serif', value: 'x'},
	[MalType.Keyword]: {type: 'fontawesome', value: 'fas fa-key'},
} as {[type: string]: {type: string; value: string; style?: string}}

const S_UI_ANNOTATE = MalSymbol.create('ui-annotate')
const K_NAME = MalKeyword.create('name')
const K_EXPANDED = MalKeyword.create('expanded')
const K_HIDDEN = MalKeyword.create('hidden')

export default defineComponent({
	name: 'ViewExpTree',
	props: {
		exp: {
			type: Object as PropType<MalVal>,
			required: true,
		},
		expSelection: {
			type: Set as PropType<Set<MalNode>>,
			required: true,
		},
		activeExp: {
			type: Object as PropType<MalNode | undefined>,
			default: undefined,
		},
		editingExp: {
			type: Object as PropType<MalVal | undefined>,
			default: undefined,
		},
		hoveringExp: {
			type: Object as PropType<MalVal | undefined>,
			default: undefined,
		},
		mode: {
			type: String as PropType<DisplayMode>,
			default: DisplayMode.Node,
		},
	},
	setup(props, context) {
		/**
		 * The flag whether the exp has UI annotaiton
		 */
		const hasAnnotation = computed(() => {
			return isUIAnnotation(props.exp)
		})

		/**
		 * the body of expression withouht ui-annotate wrapping
		 */
		const expBody = computed(() => {
			const exp = props.exp
			if (hasAnnotation.value) {
				return (exp as MalSeq)[2]
			} else {
				return props.exp
			}
		})

		/**
		 * UI Annotations
		 */
		const ui = computed(() => {
			const exp = props.exp
			if (hasAnnotation.value) {
				const info = (exp as MalSeq)[1] as MalMap
				return {
					name: info[K_NAME] || null,
					expanded: info[K_EXPANDED] || false,
					hidden: info[K_HIDDEN] || false,
				}
			}

			return {name: null, expanded: false, hidden: false}
		})

		const labelInfo = computed(() => {
			const exp = expBody.value

			if (isList(exp)) {
				return {
					label: exp[0] ? printExp(exp[0]) : '<empty>',
					clickable: props.mode === DisplayMode.Node,
					expandable: props.mode === DisplayMode.Node,
					editable: true,
					icon: {
						type: 'fontawesome',
						value: 'fas fa-caret-right',
					},
					children: exp.slice(1),
				}
			} else if (isVector(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					expandable: false,
					editable: true,
					icon: {type: 'text', value: '[ ]'},
					children: null,
				}
			} else if (isMap(exp)) {
				return {
					label: printExp(exp),
					clickable: true,
					expandable: false,
					editable: true,
					icon: {type: 'fontawesome', value: 'far fa-map'},
					children: null,
				}
			} else {
				return {
					label: printExp(exp, false),
					clickable: false,
					expandable: false,
					editable: false,
					icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
					children: null,
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

		const active = computed(() => {
			return props.activeExp && expBody.value === props.activeExp
		})

		const selected = computed(() => {
			return props.expSelection.has(expBody.value as MalNode)
		})

		const hovering = computed(() => {
			return props.hoveringExp && expBody.value === props.hoveringExp
		})

		const editing = computed(() => {
			return props.editingExp && expBody.value === props.editingExp
		})

		/**
		 * Events
		 */
		function onClick(e: MouseEvent) {
			const ctrlPressed = e.ctrlKey || e.metaKey
			context.emit(ctrlPressed ? 'toggle-selection' : 'select', expBody.value)
		}

		function toggleExpanded() {
			const annotation = {} as {[k: string]: MalVal}
			if (!ui.value.expanded === true) {
				annotation[K_EXPANDED] = true
			}
			if (ui.value.name !== null) {
				annotation[K_NAME] = ui.value.name
			}

			const newExp =
				Object.keys(annotation).length > 0
					? MalList.create(S_UI_ANNOTATE, annotation, expBody.value)
					: expBody.value

			context.emit('update:exp', newExp)
		}

		function onUpdateChildExp(i: number, replaced: MalNode) {
			const newExpBody = cloneExp(expBody.value) as MalSeq

			;(newExpBody as MalSeq)[i + 1] = replaced

			let newExp

			if (hasAnnotation.value) {
				newExp = MalList.create(
					S_UI_ANNOTATE,
					(props.exp as MalSeq)[1],
					newExpBody
				)
			} else {
				newExp = newExpBody
			}

			reconstructTree(newExp)

			context.emit('update:exp', newExp)
		}

		function onClickEditButton(e: MouseEvent) {
			e.stopPropagation()
			context.emit('update:editing-exp', expBody.value)
		}

		return {
			labelInfo,
			active,
			selected,
			hovering,
			editing,
			onClick,
			expanded,
			ui,
			toggleExpanded,
			onUpdateChildExp,
			onClickEditButton,
		}
	},
})
</script>

<style lang="stylus">
.ViewExpTree
	overflow hidden
	// padding-left 1rem
	width 100%
	user-select none

	&.destructed
		padding-left 0

		.ViewExpTree__children:before
			display none

	&__label
		position relative
		overflow hidden
		padding 0.6rem 0.5rem 0.6rem 0.3rem
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

		&.hidden
			text-decoration line-through

		&.clickable
			color var(--foreground)
			cursor pointer

			&:hover
				color var(--highlight)

			&:after
				border 1px solid var(--highlight)

		&.active
			background var(--input)
			color var(--highlight)
			font-weight bold

			&:after
				background var(--highlight)
				opacity 0.1

		&.selected
			color var(--highlight)

			&:after
				background var(--highlight)
				opacity 0.08

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
		input-transition()

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
