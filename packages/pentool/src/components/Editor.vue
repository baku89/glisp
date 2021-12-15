<template lang="pug">
.Editor(:class='{hide}')
	.Editor__code(:id='editorId')
</template>

<script lang="ts">
import {defineComponent, watch} from '@vue/runtime-core'
import ace from 'brace'

export default defineComponent({
	props: {
		hide: {type: Boolean},
		value: {type: String, required: true},
		lang: {type: String, default: 'text'},
	},
	emits: ['save', 'input'],
	setup(props, {emit}) {
		const editorId = 'editor-' + Math.random()

		const editor = ace.edit(editorId)
		editor.setValue(props.value, -1)
		editor.setTheme('ace/theme/tomorrow_night')
		editor.renderer.setShowGutter(false)
		editor.setHighlightActiveLine(false)
		editor.$blockScrolling = Infinity

		const session = editor.getSession()
		session.setMode(`ace/mode/${props.lang}`)
		session.setTabSize(2)
		session.setUseSoftTabs(false)
		session.on('change', () => {
			emit('input', editor.getValue())
		})

		editor.commands.addCommand({
			name: 'save',
			bindKey: {win: 'Ctrl-S', mac: 'Cmd-S'},
			exec: () => emit('save', editor.getValue()),
		})

		watch(
			() => props.value,
			value => {
				if (editor.getValue() != value) editor.setValue(value, -1)
			}
		)

		return {editorId}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.Editor
	position absolute
	top 0
	left 0
	width 100%
	height 100%

	&.hide
		display none

&__code
	width 100%
	height 100%
</style>
