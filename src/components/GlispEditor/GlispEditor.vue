<template>
	<div class="GlispEditor">
		<div class="GlispEditor__editor" ref="editorEl" :style="cssStyle" />
	</div>
</template>

<script lang="ts">
import ace from 'brace'
import {
	defineComponent,
	nextTick,
	onBeforeUnmount,
	onMounted,
	PropType,
	ref,
	SetupContext,
	unref,
	watch,
	watchEffect,
} from 'vue'

import {setupEditor} from './setup'
import {convertToAceRange, getEditorSelection} from './utils'

interface Props {
	modelValue: string
	lang: string
	selection?: number[]
	activeRange?: number[]
}

function useBraceEditor(props: Props, context: SetupContext) {
	const editorEl = ref<HTMLElement | null>(null)
	let editor: ace.Editor

	onMounted(() => {
		if (!editorEl.value) return

		editor = ace.edit(unref(editorEl.value))

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
				nextTick(() => {
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
					setBySelf = true
					const range = convertToAceRange(editor, start, end)
					editor.selection.setRange(range, false)
					setBySelf = false
				}
			}
		)

		let setBySelf = false

		function onChange() {
			if (setBySelf) return
			const value = editor.getValue()
			context.emit('update:modelValue', value)
		}

		function onChangeSelection() {
			if (setBySelf) return
			const selection = getEditorSelection(editor)
			context.emit('update:selection', selection)
		}

		editor.on('change', onChange)
		editor.on('changeSelection', onChangeSelection)

		// Watch the value and update the editor
		watch(
			() => props.modelValue,
			newValue => {
				if (editor.getValue() !== newValue) {
					setBySelf = true
					editor.setValue(newValue, -1)
					if (props.selection) {
						const range = convertToAceRange(
							editor,
							props.selection[0],
							props.selection[0]
						)
						editor.selection.setRange(range, false)
					}
					setBySelf = false
				}
			},
			{immediate: true}
		)

		// Enable individual features
		setupEditor(editor)

		// Language
		watchEffect(() => {
			const session = editor.getSession()
			session.setMode(`ace/mode/${props.lang}`)
		})
	})

	onBeforeUnmount(() => {
		editor.destroy()
		editor.container.remove()
	})

	return {editorEl}
}

export default defineComponent({
	name: 'GlispEditor',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		lang: {
			type: String,
			default: 'glisp',
		},
		selection: {
			type: Array as PropType<number[]>,
			required: false,
		},
		activeRange: {
			type: Array as PropType<number[]>,
			required: false,
		},
		cssStyle: {
			type: String,
			default: '',
		},
	},
	setup(props, context) {
		const {editorEl} = useBraceEditor(props, context)
		return {editorEl}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.GlispEditor
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
		height 100%
		background transparent !important
		color var(--base05) !important
		font-size 1rem

	.ace_editor
		font-monospace(important = true)

	.ace_selection
		background var(--frame) !important

	.ace_comment
		color var(--base03) !important

	.ace_keyword
		color var(--keyword) !important

	.ace_constant
		color var(--base09) !important

	.ace_function
		color var(--base0D) !important

	.ace_string
		color var(--base0B) !important

	.ace_cursor
		color var(--base05) !important

	.ace_bracket
		border 1px solid var(--accent) !important
</style>
