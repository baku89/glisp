<template>
	<div class="Editor">
		<div class="Editor__editor" ref="editorEl" />
	</div>
</template>

<script lang="ts">
import ace from 'brace'
import {appHandler} from '@/mal/console'
import {
	defineComponent,
	onMounted,
	ref,
	Ref,
	onBeforeUnmount,
	computed,
	watchEffect,
	watch,
	SetupContext
} from '@vue/composition-api'

interface Props {
	value: string
	selection: number[]
	activeRange: number[] | null
	dark: boolean
}

function replaceRange(
	s: string,
	start: number,
	end: number,
	substitute: string
) {
	return s.substring(0, start) + substitute + s.substring(end)
}

function getEditorSelection(editor: ace.Editor) {
	const sel = editor.getSelection()
	const doc = editor.getSession().doc

	const range = sel.getRange()
	const start = doc.positionToIndex(range.start, 0)
	const end = doc.positionToIndex(range.end, 0)

	return [start, end]
}

function convertToAceRange(editor: ace.Editor, start: number, end: number) {
	const doc = editor.getSession().doc

	const s = doc.indexToPosition(start, 0)
	const e = doc.indexToPosition(end, 0)

	const range = editor.getSelectionRange()
	range.setStart(s.row, s.column)
	range.setEnd(e.row, e.column)

	return range
}

function setupWheelUpdators(editor: ace.Editor) {
	// Updater
	const sel = editor.getSelection()
	const doc = editor.getSession().doc

	const wheelSpeed = (e: MouseWheelEvent) => {
		return (e.shiftKey ? 2 : e.altKey ? 0.02 : 0.5) / 10
	}

	const Updaters = [
		{
			match: /^[-+]?[0-9]+$/,
			parse: (s: string) => parseInt(s),
			update: (val: number, e: MouseWheelEvent) =>
				Math.round(val - e.deltaY * wheelSpeed(e)),
			toString: (val: number) => val.toString()
		},
		{
			match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
			parse: (s: string) => parseFloat(s),
			update: (val: number, e: MouseWheelEvent) =>
				val - e.deltaY * wheelSpeed(e),
			toString: (val: number) => val.toFixed(1)
		},
		{
			// Int 2
			match: /^[-+]?[0-9]+ [-+]?[0-9]+$/,
			parse: (s: string) => s.split(' ').map(parseFloat),
			update: ([x, y]: number[], e: MouseWheelEvent) => [
				x - e.deltaX * wheelSpeed(e),
				y - e.deltaY * wheelSpeed(e)
			],
			toString: (val: number[]) => val.map(v => v.toFixed(0)).join(' ')
		},
		{
			// Float 2
			match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+) [-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
			parse: (s: string) => s.split(' ').map(parseFloat),
			update: ([x, y]: number[], e: MouseWheelEvent) => [
				x - e.deltaX * wheelSpeed(e),
				y - e.deltaY * wheelSpeed(e)
			],
			toString: (val: number[]) => val.map(v => v.toFixed(1)).join(' ')
		}
	]

	let listener: any = null

	sel.on('changeSelection', () => {
		if (listener) {
			window.removeEventListener('mousewheel', listener)
		}

		const origStr = editor.getCopyText()

		if (origStr.trim() === '') {
			return
		}

		const updater = Updaters.find(({match}) => origStr.match(match))

		if (updater) {
			const [start, end] = getEditorSelection(editor)

			let val = updater.parse(origStr)
			const text = editor.getValue()

			const range = sel.getRange()

			listener = (e: WheelEvent) => {
				val = updater.update(val as any, e)

				const newStr = updater.toString(val as any)
				const newText = replaceRange(text, start, end, newStr)

				const newEnd = doc.indexToPosition(
					end + (newStr.length - origStr.length),
					0
				)

				range.setEnd(newEnd.row, newEnd.column)

				editor.setValue(newText)
				sel.setRange(range, false)
			}

			window.addEventListener('mousewheel', listener, {once: true})
		}
	})
}

function assignKeybinds(editor: ace.Editor) {
	editor.commands.addCommand({
		name: 'select-outer',
		bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
		exec: () => {
			console.log('sel')
			appHandler.emit('select-outer')
		}
	})

	editor.commands.addCommand({
		name: 'eval-selected',
		bindKey: {win: 'Ctrl-e', mac: 'Command-e'},
		exec: () => {
			appHandler.emit('eval-selected')
		}
	})
}

function setupBraceEditor(
	props: Props,
	context: SetupContext,
	editorEl: Ref<HTMLElement | null>
) {
	require('brace/theme/tomorrow')
	require('brace/theme/tomorrow_night')
	require('brace/mode/clojure')

	let editor: ace.Editor

	const theme = computed(() => (props.dark ? 'tomorrow_night' : 'tomorrow'))
	watchEffect(() => editor.setTheme(`ace/theme/${theme.value}`))

	onMounted(() => {
		if (!editorEl.value) return

		editor = ace.edit(editorEl.value)

		editor.setTheme(`ace/theme/${theme.value}`)
		editor.setValue(props.value, -1)
		editor.$blockScrolling = Infinity
		editor.setShowPrintMargin(false)
		editor.setOption('displayIndentGuides', false)

		const session = editor.getSession()
		session.setMode('ace/mode/clojure')
		session.setUseWrapMode(true)

		editor.setOptions({
			highlightActiveLine: false,
			showGutter: false,
			tabSize: 2,
			useSoftTabs: false,
			maxLines: Infinity
		})

		// Watch props
		let activeRangeMarker: number
		watch(
			() => props.activeRange,
			value => {
				editor.session.removeMarker(activeRangeMarker)

				if (value !== null) {
					const [start, end] = value
					const range = convertToAceRange(editor, start, end)
					activeRangeMarker = editor.session.addMarker(
						range,
						'active-range',
						'text',
						false
					)
				}
			}
		)

		watch(
			() => props.selection,
			([start, end]) => {
				const [oldStart, oldEnd] = getEditorSelection(editor)

				if (start !== oldStart || end !== oldEnd) {
					const range = convertToAceRange(editor, start, end)
					editor.selection.setRange(range, false)
				}
			}
		)

		// Watch value
		function onChange() {
			const value = editor.getValue()
			context.emit('input', value)
		}

		function onSelect() {
			const selection = getEditorSelection(editor)
			context.emit('select', selection)
		}

		editor.on('change', onChange)
		editor.on('changeSelection', onSelect)

		watch(
			() => props.value,
			newValue => {
				if (editor.getValue() !== newValue) {
					editor.off('change', onChange)
					editor.off('changeSelection', onSelect)

					editor.setValue(newValue, -1)

					editor.on('change', onChange)
					editor.on('changeSelection', onSelect)
				}
			}
		)

		// Enable individual features
		setupWheelUpdators(editor)
		assignKeybinds(editor)
	})

	onBeforeUnmount(() => {
		editor.destroy()
		editor.container.remove()
	})
}

export default defineComponent({
	props: {
		value: {
			type: String,
			required: true
		},
		selection: {
			type: Array,
			required: true
		},
		activeRange: {
			required: true
		},
		dark: {
			type: Boolean,
			required: true
		}
	},
	setup(props: Props, context) {
		const editorEl: Ref<HTMLElement | null> = ref(null)

		setupBraceEditor(props, context, editorEl)

		return {
			editorEl
		}
	}
})
</script>

<style lang="stylus">
.Editor
	position relative
	overflow-y scroll
	width 100%
	height 100%

	.active-range
		position absolute
		background var(--yellow)
		opacity 0.2

	.ace_selection
		opacity 0.5

	&__editor
		position relative
		width 100%
		background transparent !important
		font-size 1rem

	.ace_editor
		font-family 'Fira Code', monospace, sans-serif !important
</style>
