<template>
	<div class="PaneLayers" @click="deselectAll" ref="el">
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
				:exp-selection="expSelection"
				:active-exp="activeExp"
				:editing-exp="editingExp"
				:hovering-exp="hoveringExp"
				@select="selectSingleExp"
				@toggle-selection="toggleSelectedExp"
				@update:exp="onUpdateChildExp(i, $event)"
				@update:editing-exp="$emit('update:editing-exp', $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

import {MalColl, MalList, MalVal} from '@/mal/types'
import {getUIBodyExp} from '@/mal/utils'

import ViewExpTree from './ViewExpTree.vue'

export default defineComponent({
	name: 'PaneLayers',
	components: {ViewExpTree},
	props: {
		exp: {
			type: Object as PropType<MalList>,
			required: true,
		},
		selectedExp: {
			type: Array as PropType<MalVal[]>,
			required: true,
		},
		editingExp: {
			type: Object as PropType<MalVal | undefined>,
			default: undefined,
		},
		hoveringExp: {
			type: Object as PropType<MalVal | undefined>,
			default: undefined,
		},
	},
	setup(props, context) {
		const el = ref<null | HTMLElement>(null)

		/**
		 * the body of expression withouht ui-annotate wrapping
		 */
		const expBody = computed(() => getUIBodyExp(props.exp))

		const children = computed(() => {
			return props.exp.rest
		})

		const editing = computed(() => {
			return props.editingExp && expBody.value === props.editingExp
		})

		const activeExp = computed(() => {
			return props.selectedExp.length === 0 ? undefined : props.selectedExp[0]
		})

		const expSelection = computed(() => {
			return new Set(props.selectedExp.slice(1))
		})

		function onUpdateChildExp(i: number, replaced: MalColl) {
			const newExp = props.exp.clone()
			newExp.value[i + 1] = replaced

			context.emit('update:exp', newExp)
		}

		function onClickEditButton(e: MouseEvent) {
			e.stopPropagation()
			context.emit('update:editing-exp', props.exp)
		}

		// Selection manipulation
		function selectSingleExp(exp: MalColl) {
			context.emit('select', [exp])
		}

		function toggleSelectedExp(exp: MalColl) {
			const newSelection = [...props.selectedExp]

			const index = newSelection.findIndex(s => s === exp)

			if (index !== -1) {
				newSelection.splice(index, 1)
			} else {
				newSelection.unshift(exp)
			}

			context.emit('select', newSelection)
		}

		function deselectAll(e: MouseEvent) {
			if (e.target === el.value) {
				context.emit('select', [])
			}
		}

		return {
			el,
			children,
			onUpdateChildExp,
			editing,
			activeExp,
			expSelection,
			onClickEditButton,

			selectSingleExp,
			toggleSelectedExp,
			deselectAll,
		}
	},
})
</script>

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
		color base16('03')
		opacity 0
		cursor pointer

		&:hover
			opacity 0.5

		&.active
			opacity 0.7
</style>
