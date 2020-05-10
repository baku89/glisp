<template>
	<div class="Editor">
		<div class="Editor__editor" ref="editorEl" />
	</div>
</template>

<script lang="ts">
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
import ace from 'brace'
import {appHandler} from '@/mal/console'

require('brace/theme/tomorrow')
require('brace/theme/tomorrow_night')
require('brace/mode/clojure')

import {
	getEditorSelection,
	convertToAceRange,
	setupWheelUpdators,
	configureEditor
} from './use'

interface Props {
	value: string
	selection?: number[]
	activeRange?: number[]
	dark?: boolean
}

function assignKeybinds(editor: ace.Editor) {
	editor.commands.addCommand({
		name: 'select-outer',
		bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
		exec: () => {
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
	let editor: ace.Editor

	const theme = computed(() => (props.dark ? 'tomorrow_night' : 'tomorrow'))
	watchEffect(() => editor.setTheme(`ace/theme/${theme.value}`))

	onMounted(() => {
		if (!editorEl.value) return

		editor = ace.edit(editorEl.value)
		editor.setValue(props.value, -1)

		// Watch props
		let activeRangeMarker: number
		watch(
			() => props.activeRange,
			activeRange => {
				editor.session.removeMarker(activeRangeMarker)

				if (!activeRange) {
					return
				}

				const [start, end] = activeRange
				const range = convertToAceRange(editor, start, end)
				activeRangeMarker = editor.session.addMarker(
					range,
					'active-range',
					'text',
					false
				)
			}
		)

		watch(
			() => props.selection,
			selection => {
				if (!selection) {
					return
				}

				const [start, end] = selection
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
		configureEditor(editor)
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
			required: false
		},
		activeRange: {
			required: false
		},
		dark: {
			type: Boolean,
			default: false
		}
	},
	setup(props: Props, context) {
		const editorEl: Ref<HTMLElement | null> = ref(null)

		setupBraceEditor(props, context, editorEl)

		return {editorEl}
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
