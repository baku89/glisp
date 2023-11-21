<template>
	<div class="ViewExpTree">
		<div
			:class="{
				clickable: labelInfo.clickable,
				active,
				selected,
				hovering,
			}"
			class="ViewExpTree__label"
			@click="labelInfo.clickable && onClick($event)"
		>
			<div
				:class="{expanded, expandable: labelInfo.expandable}"
				class="ViewExpTree__icon"
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
					>{{ labelInfo.icon.value }}</span
				>
				<span
					v-if="labelInfo.icon.type === 'serif'"
					:style="labelInfo.icon.style"
					class="serif"
					>{{ labelInfo.icon.value }}</span
				>
			</div>
			{{ labelInfo.label }}
			<i
				v-if="labelInfo.editable"
				:class="{active: editing}"
				class="ViewExpTree__editing fas fa-code"
				@click="onClickEditButton"
			/>
		</div>
		<div v-if="labelInfo.children && expanded" class="ViewExpTree__children">
			<ViewExpTree
				v-for="(child, i) in labelInfo.children"
				:key="i"
				:activeExp="activeExp"
				:editingExp="editingExp"
				:exp="child"
				:expSelection="expSelection"
				:hoveringExp="hoveringExp"
				@select="$emit('select', $event)"
				@toggle-selection="$emit('toggle-selection', $event)"
				@update:editingExp="$emit('update:editingExp', $event)"
				@update:exp="onUpdateChildExp(i, $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed, ref} from 'vue'

import {printExp} from '@/glisp'
import {markParent} from '@/glisp/reader'
import {
	cloneExpr,
	getType,
	isList,
	isMap,
	isVector,
	ExprColl,
	ExprSeq,
	Expr,
} from '@/glisp/types'

interface Icon {
	type: 'fontawesome' | 'text' | 'serif'
	value: string
	style?: string
}

interface LabelInfo {
	label: string
	clickable: boolean
	expandable: boolean
	editable: boolean
	icon: Icon
	children: null | Expr[]
}

interface Props {
	exp: Expr
	expSelection: Set<ExprColl>
	activeExp: ExprColl | null
	editingExp: Expr | null
	hoveringExp: Expr | null
	mode?: 'node' | 'element'
}

const props = withDefaults(defineProps<Props>(), {mode: 'node'})

const emit = defineEmits<{
	select: [value: Expr]
	'toggle-selection': [value: Expr]
	'update:editingExp': [value: Expr]
	'update:exp': [value: Expr]
}>()

const IconTexts = {
	['fn']: {type: 'serif', value: 'f'},
	['number']: {type: 'text', value: '#'},
	['string']: {
		type: 'fontawesome',
		value: 'fas fa-quote-right',
		style: 'transform: scale(0.6);',
	},
	['symbol']: {type: 'serif', value: 'x'},
	['keyword']: {type: 'fontawesome', value: 'fas fa-key'},
} as Record<string, Icon>

const labelInfo = computed(() => {
	const exp = props.exp

	if (isList(exp)) {
		return {
			label: exp[0] ? printExp(exp[0]) : '<empty>',
			clickable: props.mode === 'node',
			expandable: props.mode === 'node',
			editable: true,
			icon: {
				type: 'fontawesome',
				value: 'fas fa-caret-right',
			},
			children: exp.slice(1),
		} as LabelInfo
	} else if (isVector(exp)) {
		return {
			label: printExp(exp),
			clickable: true,
			expandable: false,
			editable: true,
			icon: {type: 'text', value: '[ ]'},
			children: null,
		} as LabelInfo
	} else if (isMap(exp)) {
		return {
			label: printExp(exp),
			clickable: true,
			expandable: false,
			editable: true,
			icon: {type: 'fontawesome', value: 'far fa-map'},
			children: null,
		} as LabelInfo
	} else {
		return {
			label: printExp(exp, false),
			clickable: false,
			expandable: false,
			editable: false,
			icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
			children: null,
		} as LabelInfo
	}
})

const active = computed(() => {
	return props.activeExp && props.exp === props.activeExp
})

const selected = computed(() => {
	return props.expSelection.has(props.exp as ExprColl)
})

const hovering = computed(() => {
	return props.hoveringExp && props.exp === props.hoveringExp
})

const editing = computed(() => {
	return props.editingExp && props.exp === props.editingExp
})

/**
 * Events
 */
function onClick(e: MouseEvent) {
	const ctrlPressed = e.ctrlKey || e.metaKey
	if (ctrlPressed) {
		emit('toggle-selection', props.exp)
	} else {
		emit('select', props.exp)
	}
}

const expanded = ref(false)
function toggleExpanded() {
	expanded.value = !expanded.value
}

function onUpdateChildExp(i: number, replaced: Expr) {
	const newExpBody = cloneExpr(props.exp) as ExprSeq

	;(newExpBody as ExprSeq)[i + 1] = replaced

	const newExp = newExpBody

	markParent(newExp)

	emit('update:exp', newExp)
}

function onClickEditButton(e: MouseEvent) {
	e.stopPropagation()
	emit('update:editingExp', props.exp)
}
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
@/glis[@/glis[/reader@/glis[/types
