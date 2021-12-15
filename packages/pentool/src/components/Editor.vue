<template lang="pug">
.Editor(:class='{hide}')
	.Editor__code(ref='el')
</template>

<script lang="ts">
import {defineComponent, onMounted, ref, watch} from '@vue/runtime-core'
import ace from 'brace'

export default defineComponent({
	props: {
		hide: {type: Boolean},
		modelValue: {type: String, required: true},
		lang: {type: String, default: 'text'},
	},
	emits: ['save', 'update:modelValue'],
	setup(props, {emit}) {
		const el = ref<HTMLElement | null>(null)

		onMounted(() => {
			if (!el.value) return

			const editor = ace.edit(el.value)
			editor.setValue(props.modelValue, -1)
			// editor.setTheme('ace/theme/tomorrow_night')
			editor.renderer.setShowGutter(false)
			editor.setHighlightActiveLine(false)
			editor.$blockScrolling = Infinity

			const session = editor.getSession()
			session.setMode(`ace/mode/${props.lang}`)
			session.setTabSize(2)
			session.setUseSoftTabs(false)
			session.on('change', () => {
				emit('update:modelValue', editor.getValue())
			})

			editor.commands.addCommand({
				name: 'save',
				bindKey: {win: 'Ctrl-S', mac: 'Cmd-S'},
				exec: () => emit('save', editor.getValue()),
			})

			watch(
				() => props.modelValue,
				value => {
					if (editor.getValue() != value) editor.setValue(value, -1)
				}
			)
		})

		return {el}
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
