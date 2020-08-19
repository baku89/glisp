<template>
	<div class="CommandDialog">
		<div class="CommandDialog__content">
			<div class="CommandDialog__header">
				<div class="CommandDialog__name">{{ fnName }}</div>
				<VueMarkdown
					class="CommandDialog__doc"
					:source="fnDoc"
					:anchorAttributes="{target: '_blank'}"
				/>
			</div>
			<ParamControl :exp="editExp" :fn="fn" @input="onInput" />
		</div>
		<div class="CommandDialog__buttons">
			<button class="button" @click="$emit('close')">Cancel</button>
			<button class="button" @click="onClickExecute">Execute</button>
		</div>
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	computed,
	SetupContext,
} from '@vue/composition-api'
import ParamControl from './ParamControl.vue'
import {NonReactive} from '@/utils'
import {
	MalVal,
	MalFunc,
	getMeta,
	MalSymbol,
	isList,
	isSymbol,
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'
import VueMarkdown from 'vue-markdown'
import {printExp} from '@/mal'
import {printer} from '@/mal/printer'

interface Props {
	exp: NonReactive<MalVal[]>
	fn: MalFunc
}

export default defineComponent({
	name: 'CommandDialog',
	components: {ParamControl, VueMarkdown},
	props: {
		exp: {
			required: true,
			validator: v =>
				v instanceof NonReactive && isList(v.value) && isSymbol(v.value[0]),
		},
		fn: {
			type: Function,
			required: true,
		},
	},
	setup(props: Props, context: SetupContext) {
		const meta = getMeta(props.fn)
		const fnName = computed(() => (props.exp.value[0] as MalSymbol).value)
		const fnDoc = computed(() => getMapValue(meta, 'doc') || '')
		const editExp: Ref<NonReactive<MalVal>> = ref(props.exp)

		function onInput(newExp: NonReactive<MalVal>) {
			editExp.value = newExp
		}

		function onClickExecute() {
			context.emit('close')
			const command = printExp(editExp.value.value)

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
.CommandDialog
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
