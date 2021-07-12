<template>
	<div class="Console" ref="root" tabindex="0" @keydown="onKeydown">
		<ul class="Console__history">
			<li class="rep" v-for="({input, log, output}, i) in results" :key="i">
				<SyntaxHighligher class="input" :code="input" />
				<div
					v-for="({level, reason}, j) in log"
					:key="j"
					class="log"
					:class="level"
				>
					{{ reason }}
				</div>
				<SyntaxHighligher
					class="output"
					v-if="output !== null"
					:code="output"
				/>
			</li>
		</ul>
		<div class="Console__command" :style="{height: lines * 21 + 'px'}">
			<MonacoEditor
				class="Console__code"
				v-model="code"
				v-model:editor="editorInstance"
				@keydown.enter="run"
			/>
		</div>
		<div class="Console__fill" @click="focusEditor" />
	</div>
</template>

<script lang="ts">
import {useLocalStorage} from '@vueuse/core'
import {editor as Editor, KeyCode} from 'monaco-editor'
import {computed, defineComponent, PropType, ref, shallowRef, watch} from 'vue'

import MonacoEditor from '@/components/layouts/MonacoEditor/MonacoEditor.vue'
import SyntaxHighligher from '@/components/layouts/SyntaxHighligher.vue'
import {Log, WithLog} from '@/lib/WithLog'

type MaybePromise<T> = T | Promise<T>

export type IFnRep = (str: string) => MaybePromise<WithLog<string | null>>

interface Result {
	input: string
	log: Log[]
	output: string | null
}

const ConsoleLogger: Record<Log['level'], (...x: any[]) => void> = {
	error: console.error,
	warn: console.warn,
	info: console.info,
}

export default defineComponent({
	name: 'Console',
	components: {MonacoEditor, SyntaxHighligher},
	props: {
		rep: {
			type: Function as PropType<IFnRep>,
			required: true,
		},
		uid: {
			type: String,
			default: '',
		},
		maxHistory: {
			type: Number,
			default: 1000,
		},
	},
	emits: ['setup', 'update:onError'],
	setup(props) {
		const code = ref('')
		const editorInstance =
			shallowRef<null | ReturnType<typeof Editor.create>>(null)

		const results = ref<Result[]>([])

		// Newer has fewer index
		const history = useLocalStorage<string[]>(
			`Console__history${props.uid}`,
			[]
		)
		let activeHistoryIndex = -1

		const lines = computed(() => code.value.split('\n').length)

		async function run(e: KeyboardEvent) {
			if (e.shiftKey) return
			e.preventDefault()
			if (code.value === '') return

			const [result, log] = await props.rep(code.value)

			// Print log to the inspector
			log.forEach(l => ConsoleLogger[l.level](l.reason, l.error))

			results.value.push({
				input: code.value,
				log,
				output: result,
			})

			if (code.value !== history.value[0]) {
				history.value.unshift(code.value)
			}

			code.value = ''
			activeHistoryIndex = -1
		}

		// Up/Down key to navigate history
		watch(editorInstance, editor => {
			if (!editor) return

			editor.onKeyDown(e => {
				const key = e.keyCode
				if (key !== KeyCode.UpArrow && key !== KeyCode.DownArrow) return

				const pos = editor.getPosition()
				if (!pos) return

				const {lineNumber} = pos
				const lineCount = editor.getModel()?.getLineCount()

				if (key === KeyCode.UpArrow && lineNumber === 1) {
					// Pressed Up at the first line
					searchHistory(+1)
				} else if (key === KeyCode.DownArrow && pos.lineNumber === lineCount) {
					// Prssed Down at the last line
					searchHistory(-1)
				}
			})
		})

		function searchHistory(delta: number) {
			activeHistoryIndex = Math.max(-1, activeHistoryIndex + delta)
			if (
				0 <= activeHistoryIndex &&
				activeHistoryIndex < history.value.length
			) {
				code.value = history.value[activeHistoryIndex]
			}
		}

		function focusEditor() {
			editorInstance.value?.focus()
		}

		function onKeydown(e: KeyboardEvent) {
			if (e.key.length === 1 && !editorInstance.value?.hasTextFocus()) {
				focusEditor()
			}
		}

		return {
			code,
			editorInstance,
			lines,
			results,
			run,
			searchHistory,
			focusEditor,
			onKeydown,
		}
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
	display flex
	flex-direction column
	overflow scroll
	user-select text

	&__history
		font-monospace()

		.rep
			margin-bottom 7px
			padding-bottom 7px
			border-bottom 1px solid base16('05', 0.05)

		.input, .output, .log
			position relative
			padding-left $indent
			white-space pre

			&:before
				position absolute
				left 0
				font-monospace()
				display block
				font-weight bold

		.input:before
			color base16('04')
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
				color base16('03')
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
		height 100%

	&__fill
		flex-grow 1
</style>
