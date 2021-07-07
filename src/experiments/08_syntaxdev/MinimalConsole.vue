<template>
	<div class="Console">
		<ul class="Console__history">
			<li class="rep" v-for="({input, logs, output}, i) in results" :key="i">
				<div class="input">{{ input }}</div>
				<div
					v-for="({level, reason}, j) in logs"
					:key="j"
					class="log"
					:class="level"
				>
					{{ reason }}
				</div>
				<div class="output" v-if="output !== null">{{ output }}</div>
			</li>
		</ul>
		<div class="Console__command">
			<MonacoEditor
				class="Console__code"
				v-model="code"
				@keydown.enter="execute"
				:style="{height: lines * 21 + 'px'}"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

import MonacoEditor from '@/components/layouts/MonacoEditor/MonacoEditor.vue'

import {Log, WithLogs} from './glisp'

type MaybePromise<T> = T | Promise<T>

export type IFnRep = (str: string) => MaybePromise<WithLogs<string | null>>

interface Result {
	input: string
	logs: Log[]
	output: string | null
}

export default defineComponent({
	name: 'MinimalConsole',
	components: {MonacoEditor},
	props: {
		rep: {
			type: Function as PropType<IFnRep>,
			required: true,
		},
		name: {
			type: String,
			default: 'minimal-console',
		},
	},
	emits: ['setup', 'update:onError'],
	setup(props) {
		const code = ref('')

		const results = ref<Result[]>([])

		const lines = computed(() => code.value.split('\n').length)

		async function execute(e: KeyboardEvent) {
			e.preventDefault()

			const result = await props.rep(code.value)

			results.value.push({
				input: code.value,
				logs: result.logs,
				output: result.result,
			})

			code.value = ''
		}

		return {code, lines, results, execute}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.Console
	position relative
	height 100%
	font-size 14px
	line-height 21px
	$indent = 1.5em
	overflow scroll
	user-select text

	&__history
		font-monospace()

		.rep
			margin-bottom 14px

		.input, .output, .log
			position relative
			padding-left $indent
			white-space pre-line

			&:before
				position absolute
				left 0
				font-monospace()
				display block
				font-weight bold

		.input:before
			color base16('03')
			content '>'

		.error
			color base16('08')

			&:before
				content 'X'

		.warn
			color base16('0A')

			&:before
				content '!'

		.info
			color base16('0B')

			&:before
				content 'i'

		.output
			color base16('04')

			&:before
				color base16('02')
				content '<'

	&__command
		position relative

		&:before
			position absolute
			font-monospace()
			color base16('accent')
			content '>'
			font-weight bold

	&__code
		margin-left $indent
		height 1.5em
</style>
