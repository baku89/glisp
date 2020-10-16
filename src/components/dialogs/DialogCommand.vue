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
			<ParamControl :exp="editExp" :fn="fn" @input="onInput" />
		</div>
		<div class="DialogCommand__buttons">
			<button class="button" @click="$emit('close')">Cancel</button>
			<button class="button" @click="onClickExecute">Execute</button>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, computed, PropType} from 'vue'
import ParamControl from '@/components/ParamControl.vue'
import {MalVal, MalFunc, MalSymbol, MalList, MalSeq} from '@/mal/types'
import {getExpByPath} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'
import VueMarkdown from 'vue-markdown'
import {printExp} from '@/mal'
import {printer} from '@/mal/printer'

export default defineComponent({
	name: 'DialogCommand',
	components: {ParamControl, VueMarkdown},
	props: {
		exp: {
			type: Object as PropType<MalList>,
			required: true,
		},
		fn: {
			type: Object as PropType<MalFunc>,
			required: true,
		},
	},
	setup(props, context) {
		const meta = props.fn.meta
		const fnName = computed(() => (props.exp.fn as MalSymbol).value)
		const fnDoc = computed(() => getExpByPath(meta, 'doc') || '')
		const editExp = ref(props.exp)

		function onInput(newExp: MalList) {
			editExp.value = newExp
		}

		function onClickExecute() {
			context.emit('close')
			const command = editExp.value.print()

			// Show the executed command in the console and add it to the history
			printer.pseudoExecute(command)

			// Execute
			ConsoleScope.readEval(command)
		}

		return {
			editExp,
			fnName,
			fnDoc,
			onInput,
			onClickExecute,
		}
	},
})
</script>

<style lang="stylus">
.DialogCommand
	position relative
	height 100%
	text-align left
	user-select none
	translucent-bg()

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
			color var(--highlight)
			opacity 1

	&__doc
		line-height 1.4

		code
			color var(--function)

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
