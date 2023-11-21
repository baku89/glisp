<script lang="ts" setup>
import ace from 'brace'
import {
	nextTick,
	onBeforeUnmount,
	onMounted,
	Ref,
	ref,
	watch,
	watchEffect,
} from 'vue'

import {setupEditor} from './setup'
import {convertToAceRange, getEditorSelection} from './utils'

type Range = readonly [start: number, end: number]

interface Props {
	value: string
	selection?: Range
	activeRange?: Range
	cssStyle?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
	input: [value: string]
	'update:selection': [selection: number[]]
}>()

const $editor: Ref<HTMLElement | null> = ref(null)
let editor: ace.Editor

onMounted(() => {
	if (!$editor.value) return

	editor = ace.edit($editor.value)

	// Update activeRange
	let activeRangeMarker: number

	watchEffect(() => {
		if (!props.activeRange) return

		const [start, end] = props.activeRange
		const range = convertToAceRange(editor, start, end)

		editor.session.removeMarker(activeRangeMarker)

		nextTick(() => {
			activeRangeMarker = editor.session.addMarker(
				range,
				'active-range',
				'text',
				false
			)
		})
	})

	// Update selection
	let setBySelf = false

	watchEffect(() => {
		if (!props.selection) return

		const [start, end] = props.selection
		const [oldStart, oldEnd] = getEditorSelection(editor)

		if (start !== oldStart || end !== oldEnd) {
			setBySelf = true
			const range = convertToAceRange(editor, start, end)
			editor.selection.setRange(range, false)
			setBySelf = false
		}
	})

	editor.on('change', () => {
		if (setBySelf) return
		const value = editor.getValue()
		emit('input', value)
	})

	editor.on('changeSelection', () => {
		if (setBySelf) return
		const selection = getEditorSelection(editor)
		emit('update:selection', selection)
	})

	// Watch the value and update the editor
	watch(
		() => props.value,
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
})

onBeforeUnmount(() => {
	editor.destroy()
	editor.container.remove()
})
</script>

<template>
	<div class="GlispEditor">
		<div ref="$editor" class="GlispEditor__editor" :style="cssStyle" />
	</div>
</template>

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
