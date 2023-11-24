<script lang="ts" setup>
import {computed, Ref, ref} from 'vue'
import VueMarkdown from 'vue-markdown'

import ParamControl from '@/components/ParamControl.vue'
import {Expr, ExprFn, ExprSymbol, getMapValue, getMeta, printer} from '@/glisp'
import ConsoleScope from '@/scopes/console'

interface Props {
	exp: Expr[]
	fn: ExprFn
}

const props = defineProps<Props>()
const emit = defineEmits<{
	close: []
}>()

const meta = getMeta(props.fn)
const fnName = computed(() => (props.exp[0] as ExprSymbol).value)
const fnDoc = computed(() => getMapValue(meta, 'doc') || '')
const editExp: Ref<Expr> = ref(props.exp)

function onInput(newExp: Expr) {
	editExp.value = newExp
}

function onClickExecute() {
	emit('close')
	const command = printExpr(editExp.value)

	// Show the executed command in the console and add it to the history
	printer.pseudoExecute(command)

	// Execute
	ConsoleScope.readEval(command)
}
</script>

<template>
	<div class="DialogCommand">
		<div class="DialogCommand__content">
			<div class="DialogCommand__header">
				<div class="DialogCommand__name">{{ fnName }}</div>
				<VueMarkdown
					class="DialogCommand__doc"
					:source="fnDoc"
					:anchorAttributes="{target: '_blank'}"
				/>
			</div>
			<ParamControl :expr="editExp" :fn="fn" @input="onInput" />
		</div>
		<div class="DialogCommand__buttons">
			<button class="button" @click="$emit('close')">Cancel</button>
			<button class="button" @click="onClickExecute">Execute</button>
		</div>
	</div>
</template>

<style lang="stylus">
.DialogCommand
	position relative
	height 100%
	text-align left
	user-select none

	.fira-code
		font-monospace()

	&__content
		padding 2rem 2rem 2.5rem

	&__header
		position relative
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

		.alias
			color var(--comment)
			font-weight normal
			font-size 0.95em

	&__outer
		position absolute
		top 0
		right 0
		color var(--comment)
		opacity 0.6

		&:hover
			color var(--hover)
			opacity 1

	&__doc
		line-height 1.4

		code
			color var(--syntax-function)

	&__buttons
		display flex
		border-top 1px solid var(--border)

		.button
			display block
			flex-grow 1
			padding 1rem
			border-right 1px solid var(--border)
			color var(--comment)

			&:hover
				color var(--highlight)

			&:last-child
				border-right none
</style>
@/glis[@/glis[/printer@/glis[/types@/glis[/utils
