<script lang="ts" setup>
import 'normalize.css'

import {computed, Ref, ref, watch} from 'vue'

import GlispEditor from '@/components/GlispEditor'
import {BlankException, Expr, parse, printer, printExpr} from '@/glisp'
import ConsoleScope from '@/scopes/console'
import ViewScope from '@/scopes/view'
import {computeTheme} from '@/theme'

const OFFSET_START = 8 // length of "(sketch\n"
const OFFSET_END = 2 // length of "/n)"

const background = ref('#f8f8f8')
const colors = computed(() => computeTheme(background.value).colors)
const guideColor = computed(() => colors.value['--selection'])

const code = ref('')
const exp = ref(null) as Ref<Expr>
const hasError = computed(() => {
	return (
		hasParseError.value || hasEvalError.value || hasRenderError.value.valueOf
	)
})
const hasParseError = ref(false)
const hasEvalError = computed(() => viewExpr.value === null)
const hasRenderError = ref(false)

const viewExpr = computed(() => {
	return evalExp()
})

const editorURL = computed(() => {
	// data.code
	const url = new URL('.', location.href)
	url.searchParams.set('code', code.value)

	return url.toString()
})

function evalExp() {
	if (!exp.value) {
		return []
	}

	ViewScope.setup({
		guideColor: guideColor.value,
	})

	ViewScope.def('*width*', 100)
	ViewScope.def('*height*', 100)
	ViewScope.def('*size*', [100, 100])

	const viewExpr = ViewScope.eval(exp.value)
	if (viewExpr !== undefined) {
		ConsoleScope.def('*view*', viewExpr)
		return viewExpr
	} else {
		return null
	}
}

// Code <-> Exp Conversion
watch(
	() => code.value,
	code => {
		const evalCode = `(sketch\n${code}\n)`
		let _exp
		try {
			_exp = parse(evalCode)
		} catch (err) {
			if (!(err instanceof BlankException)) {
				printer.error(err)
			}
			hasParseError.value = true
			return
		}
		hasParseError.value = false
		exp.value = _exp
	}
)

watch(
	() => exp.value,
	() => {
		if (exp.value) {
			code.value = printExpr(exp.value).slice(OFFSET_START, -OFFSET_END)
		} else {
			code.value = ''
		}
	}
)

// Parse URL

{
	// URL
	const url = new URL(location.href)

	// Load initial codes
	let _code = ''

	const queryCode = url.searchParams.get('code')

	if (queryCode) {
		_code = decodeURI(queryCode)
		url.searchParams.delete('code')
	}

	code.value = _code
}
</script>

<template>
	<div
		id="app"
		class="PageEmbed"
		:style="{...colors, background}"
		:class="{error: hasError}"
	>
		<div class="PageEmbed__editor">
			<GlispEditor
				:value="code"
				cssStyle="line-height: 1.5"
				@input="code = $event"
			/>1
		</div>
		<div class="PageEmbed__viewer">
			<!-- <ViewCanvas
				:exp="viewExpr"
				:guide-color="guideColor"
				@render="hasRenderError = !$event"
			/> -->
		</div>
		<a class="PageEmbed__open-editor" :href="editorURL" target="_blank">
			<i class="fas fa-external-link-alt"></i>
		</a>
	</div>
</template>

<style lang="stylus">
@import './style/global.styl'

$compact-dur = 0.4s

.PageEmbed
	position relative
	display flex
	padding 1rem
	min-height calc(102px + 4rem)
	height auto
	border-left 2px solid #eee

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
		border 1px solid var(--selection)

	&__editor
		position relative
		flex-grow 1

	&__open-editor
		position absolute
		right 1rem
		bottom 1rem
		display block
		color var(--selection)
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
			color var(--hover)
</style>
@/glis[@/glis[/printer@/glis[/reader@/glis[/types
