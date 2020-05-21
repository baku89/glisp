<template>
	<div
		id="app"
		class="PageEmbed"
		:style="{...colors, background}"
		:class="{error: hasError}"
	>
		<div class="PageEmbed__editor">
			<Editor :value="code" @input="code = $event" />
		</div>
		<div class="PageEmbed__viewer">
			<Viewer
				:exp="viewExp"
				:guide-color="guideColor"
				@resize="viewerSize = $event"
				@render="hasRenderError = !$event"
			/>
		</div>
		<a class="PageEmbed__open-editor" :href="editorURL" target="_blank">
			<i class="fas fa-external-link-alt"></i>
		</a>
	</div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-use-before-define */
import 'normalize.css'

import {
	defineComponent,
	reactive,
	computed,
	watch,
	toRefs
} from '@vue/composition-api'

import Editor from '@/components/Editor'
import Viewer from '@/components/Viewer.vue'

import {printExp, readStr} from '@/mal'
import {MalVal} from '@/mal/types'

import {nonReactive, NonReactive} from '@/utils'
import {printer} from '@/mal/printer'
import {BlankException} from '@/mal/reader'
import ViewScope from '@/scopes/view'
import ConsoleScope from '@/scopes/console'

const BRIGHT_COLORS = {
	'--currentline': '#efefef',
	'--selection': '#d6d6d6',
	'--foreground': '#4d4d4c',
	'--comment': '#8e908c',
	'--red': '#c82829',
	'--orange': '#f5871f',
	'--yellow': '#eab700',
	'--green': '#718c00',
	'--aqua': '#3e999f',
	'--blue': '#4271ae',
	'--purple': '#8959a8'
}

const OFFSET = 8 // length of "(sketch "

interface Data {
	code: string
	exp: NonReactive<MalVal> | null
	viewExp: NonReactive<MalVal> | null
	hasError: boolean
	hasParseError: boolean
	hasEvalError: boolean
	hasRenderError: boolean
}

interface UI {
	background: string
	colors: {[k: string]: string}
	viewerSize: [number, number]
	guideColor: string
}

function parseURL(data: Data) {
	// URL
	const url = new URL(location.href)

	// Load initial codes
	let code = ''

	const queryCode = url.searchParams.get('code')

	if (queryCode) {
		code = decodeURI(queryCode)
		url.searchParams.delete('code')
	}

	data.code = code
}

export default defineComponent({
	name: 'PageEmbed',
	components: {
		Editor,
		Viewer
	},
	setup() {
		const ui = reactive({
			background: 'whiteSmoke',
			colors: BRIGHT_COLORS,
			viewerSize: [0, 0],
			guideColor: computed(() => ui.colors['--selection'])
		}) as UI

		const data = reactive({
			code: '',
			exp: null,
			hasError: computed(() => {
				return data.hasParseError || data.hasEvalError || data.hasRenderError
			}),
			hasParseError: false,
			hasEvalError: computed(() => data.viewExp === null),
			hasRenderError: false,
			viewExp: computed(() => {
				return evalExp()
			})
		}) as Data

		const editorURL = computed(() => {
			// data.code
			const url = new URL('.', location.href)
			url.searchParams.set('code', data.code)

			return url.toString()
		})

		function evalExp() {
			const exp = data.exp

			if (!exp) {
				return null
			}

			ViewScope.setup({
				width: ui.viewerSize[0],
				height: ui.viewerSize[1],
				guideColor: ui.guideColor
			})

			const viewExp = ViewScope.eval(exp.value)
			if (viewExp !== undefined) {
				ConsoleScope.def('*view*', viewExp)
				return nonReactive(viewExp)
			} else {
				return null
			}
		}

		// Code <-> Exp Conversion
		watch(
			() => data.code,
			code => {
				const evalCode = `(sketch ${code}\nnil)`
				let exp
				try {
					exp = nonReactive(readStr(evalCode, true))
				} catch (err) {
					if (!(err instanceof BlankException)) {
						printer.error(err)
					}
					data.hasParseError = true
					return
				}
				data.hasParseError = false
				data.exp = exp
			}
		)

		watch(
			() => data.exp,
			() => {
				if (data.exp) {
					data.code = printExp(data.exp.value).slice(OFFSET, -5)
				} else {
					data.code = ''
				}
			}
		)

		parseURL(data)

		return {
			...toRefs(data as any),
			...toRefs(ui as any),
			editorURL
		}
	}
})
</script>

<style lang="stylus">
@import "./style/common.styl"

$compact-dur = 0.4s

.PageEmbed
	background var(--background)
	color var(--foreground)
	display flex
	padding 1rem
	min-height calc(102px + 4rem)

	&:after
		content ''
		display block
		position absolute
		pointer-events none
		width 100%
		height 100%
		top 0
		left 0
		border .5em solid #ff5e5e
		opacity 0
		transition opacity .1s ease

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
		display block
		bottom 1rem
		right 1rem
		color var(--selection)
		font-size 1.1rem
		transition all .2s ease
		cursor pointer

		&:before
			content 'Open in Editor'
			font-size 1rem
			vertical-align top
			display inline-block
			margin-right .7em
			margin-top .1em

		&:hover
			color var(--aqua)
</style>
