<script lang="ts" setup>
import {computed, Ref, ref} from 'vue'

import {markParent} from '@/glisp/reader'
import {cloneExpr, ExprColl, ExprSeq, Expr} from '@/glisp/types'

import ViewExpTree from './ViewExpTree.vue'

interface Props {
	exp: ExprSeq
	selectedExp: Expr[]
	editingExp: Expr | null
	hoveringExp: Expr | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
	select: [exp: Expr[]]
	'update:exp': [exp: ExprSeq]
	'update:editingExp': [exp: Expr | null]
}>()

const el: Ref<null | HTMLElement> = ref(null)

const children = computed(() => {
	return props.exp.slice(1)
})

const editing = computed(() => {
	return props.editingExp && props.exp === props.editingExp
})

const activeExp = computed(() => {
	return props.selectedExp.length === 0 ? null : props.selectedExp[0]
})

const expSelection = computed(() => {
	return new Set(props.selectedExp.slice(1))
})

function onUpdateChildExp(i: number, replaced: ExprColl) {
	const newExp = cloneExpr(props.exp)

	newExp[i + 1] = replaced

	markParent(newExp)

	emit('update:exp', newExp)
}

function onClickEditButton(e: MouseEvent) {
	e.stopPropagation()
	emit('update:editingExp', props.exp)
}

// Selection manipulation
function selectSingleExp(exp: ExprColl) {
	emit('select', [exp])
}

function toggleSelectedExp(exp: ExprColl) {
	const newSelection = [...props.selectedExp]

	const index = newSelection.findIndex(s => s === exp)

	if (index !== -1) {
		newSelection.splice(index, 1)
	} else {
		newSelection.unshift(exp)
	}

	emit('select', newSelection)
}

function deselectAll(e: MouseEvent) {
	if (e.target === el.value) {
		emit('select', [])
	}
}
</script>

<template>
	<div ref="el" class="PaneLayers" @click="deselectAll">
		<div class="PaneLayers__header">
			<div class="PaneLayers__title">Layers</div>
			<i
				class="PaneLayers__editing fas fa-code"
				:class="{active: editing}"
				@click="onClickEditButton"
			/>
		</div>
		<div class="PaneLayers__children">
			<ViewExpTree
				v-for="(child, i) in children"
				:key="i"
				:exp="child"
				:expSelection="expSelection"
				:activeExp="activeExp"
				:editingExp="editingExp"
				:hoveringExp="hoveringExp"
				@select="selectSingleExp"
				@toggle-selection="toggleSelectedExp"
				@update:exp="onUpdateChildExp(i, $event)"
				@update:editingExp="$emit('update:editingExp', $event)"
			/>
		</div>
	</div>
</template>

<style lang="stylus">
.PaneLayers
	overflow hidden
	padding-left 2px

	&__header
		position relative
		padding 1rem 1.2rem 0.5rem
		user-select none

	&__title
		font-weight bold

	&__editing
		position absolute
		top 1.2rem
		right 1rem
		color var(--comment)
		opacity 0
		cursor pointer

		&:hover
			opacity 0.5

		&.active
			opacity 0.7
</style>
@/glis[/reader@/glis[/types
