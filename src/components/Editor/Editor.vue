<template>
	<div class="Editor">
		<div class="Editor__editor" ref="editorEl" :style="cssStyle" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	onMounted,
	ref,
	Ref,
	onBeforeUnmount,
	watch,
	SetupContext,
	PropType
} from '@vue/composition-api'
import ace from 'brace'

import {setupEditor} from './setup'
import {getEditorSelection, convertToAceRange} from './utils'

interface Props {
	value: string
	selection?: number[]
	activeRange?: number[]
}

function setupBraceEditor(
	props: Props,
	context: SetupContext,
	editorEl: Ref<HTMLElement | null>
) {
	let editor: ace.Editor

	onMounted(() => {
		if (!editorEl.value) return

		editor = ace.edit(editorEl.value)
		editor.setValue(props.value, -1)

		// Update activeRange
		let activeRangeMarker: number
		watch(
			() => props.activeRange,
			activeRange => {
				editor.session.removeMarker(activeRangeMarker)

				if (!activeRange) {
					return
				}

				// NOTE: Make sure to update the marker, add marker for next tick
				context.root.$nextTick(() => {
					const [start, end] = activeRange
					const range = convertToAceRange(editor, start, end)
					activeRangeMarker = editor.session.addMarker(
						range,
						'active-range',
						'text',
						false
					)
				})
			}
		)

		// Update selection
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
			context.emit('update:selection', selection)
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
					if (props.selection) {
						const range = convertToAceRange(
							editor,
							props.selection[0],
							props.selection[0]
						)
						editor.selection.setRange(range, false)
					}

					editor.on('change', onChange)
					editor.on('changeSelection', onSelect)
				}
			}
		)

		// Enable individual features
		setupEditor(editor)
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
			type: Array as PropType<number[]>,
			required: false
		},
		activeRange: {
			type: Array as PropType<number[]>,
			required: false
		},
		cssStyle: {
			type: String,
			default: ''
		}
	},
	setup(props, context) {
		const editorEl: Ref<HTMLElement | null> = ref(null)

		setupBraceEditor(props, context, editorEl)

		return {editorEl}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.Editor
	position relative
	overflow-y scroll
	width 100%
	height 100%
	font-monospace()

	.active-range
		position absolute
		background var(--active-range)

	.ace_selection
		opacity 0.5

	// Theme overwriting by CSS
	&__editor
		position relative
		width 100%
		background transparent !important
		color var(--foreground) !important
		font-size 1rem

	.ace_editor
		font-family 'Fira Code', monospace, sans-serif !important

	.ace_comment
		color var(--syntax-comment) !important

	.ace_keyword
		color var(--syntax-keyword) !important

	.ace_constant
		color var(--syntax-constant) !important

	.ace_function
		color var(--syntax-function) !important

	.ace_string
		color var(--syntax-string) !important

	.ace_cursor
		color var(--foreground) !important

	.ace_bracket
		border 1px solid var(--highlight) !important
</style>
