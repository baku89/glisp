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
import {computed, defineComponent, PropType, ref} from 'vue'
import VueMarkdown from 'vue-markdown'

import ParamControl from '@/components/ParamControl.vue'
import {printer} from '@/mal/printer'
import {MalFunc, MalList, MalSymbol} from '@/mal/types'
import {getExpByPath} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'

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
			color base16('03')
			font-weight normal
			font-size 0.95em

	&__outer
		position absolute
		top 0
		right 0
		color base16('03')
		opacity 0.6

		&:hover
			color base16('accent')
			opacity 1

	&__doc
		line-height 1.4

		code
			color base16('0D')

	&__buttons
		display flex
		border-top 1px solid $color-frame

		.button
			display block
			flex-grow 1
			padding 1rem
			border-right 1px solid $color-frame
			color base16('03')

			&:hover
				color base16('accent')

			&:last-child
				border-right none
</style>
