<template>
	<div id="app" class="PageEmbed" :style="cssStyle" :class="{error: hasError}">
		<div class="PageEmbed__editor">
			<GlispEditor v-model="code" cssStyle="line-height: 1.5" />
		</div>
		<div class="PageEmbed__viewer">
			<ViewCanvas
				:exp="viewExp"
				:guide-color="guideColor"
				@render="hasRenderError = !$event"
			/>
		</div>
		<a class="PageEmbed__open-editor" @click="openEditor">
			<i class="fas fa-external-link-alt"></i>
		</a>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {defineComponent, computed, watch, shallowRef, ref} from 'vue'

import GlispEditor from '@/components/GlispEditor'
import ViewCanvas from '@/components/ViewCanvas.vue'

import useScheme from '@/components/use/use-scheme'
import {MalNil, MalVal} from '@/mal/types'
import Scope from '@/mal/scope'

function getCodeFromURL() {
	return decodeURI(new URL(location.href).searchParams.get('code') || '')
}

export default defineComponent({
	name: 'PageEmbed',
	components: {
		GlispEditor,
		ViewCanvas,
	},
	setup() {
		// Scope
		const scope = shallowRef<Scope | null>(null)

		;(async () => {
			const repl = await Scope.createRepl()
			await repl.REP(`
				(do
					(import "math")
					(import "color")
					(import "graphics")
					(import "path"))`)
			scope.value = new Scope(repl, 'view')
		})()

		// Code
		const code = ref(getCodeFromURL())
		const viewExp = shallowRef<MalVal | undefined>(MalNil.from())

		const hasReadEvalError = computed(() => !code.value)
		const hasRenderError = ref(false)
		const hasError = computed(
			() => hasReadEvalError.value || hasRenderError.value
		)

		watch(
			() => [code.value, scope.value],
			async () => {
				if (!scope.value || !scope.value) return

				const sc = scope.value

				sc.setup()
				sc.def('*guide-color*', colors.value.highlight)
				sc.def('*width*', 100)
				sc.def('*height*', 100)
				sc.def('*size*', [100, 100])

				console.time('EVAL')
				viewExp.value = await sc.readEval(`(do\n${code.value}\n)`)
				console.timeEnd('EVAL')
			}
		)

		// UI
		const {cssStyle, colors} = useScheme()

		function openEditor() {
			const url = new URL('.', location.href)
			url.searchParams.set('code', code.value)
			window.open(url.toString())
		}

		return {
			cssStyle,
			code,
			viewExp,
			hasError,
			hasRenderError,
			openEditor,
		}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/global.styl'
@import '../../components/style/common.styl'

$compact-dur = 0.4s

.PageEmbed
	app()
	position relative
	display flex
	padding 1rem
	min-height calc(102px + 4rem)
	height auto
	border-left 2px solid #eee
	background var(--background)
	color var(--textcolor)

	&:after
		position absolute
		top 0
		left 0
		display block
		width 100%
		height 100%
		border 0.5em solid #ff5e5e
		content ''
		opacity 0
		input-transition(opacity)
		pointer-events none

	&.error:after
		opacity 1

	&__viewer
		position relative
		width 102px
		height 102px
		border 1px solid var(--frame)

	&__editor
		position relative
		flex-grow 1

	&__open-editor
		position absolute
		right 1rem
		bottom 1rem
		display block
		color var(--comment)
		font-size 1.1rem
		cursor pointer
		transition all 0.2s ease

		&:before
			display inline-block
			margin-top 0.1em
			margin-right 0.7em
			content 'Open in Editor'
			vertical-align top
			font-size 1rem

		&:hover
			color var(--highlight)
</style>
