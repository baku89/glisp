<template>
	<div
		id="app"
		:class="{'background-set': backgroundSet, compact}"
		:style="colors"
		@mousewheel="onScroll"
	>
		<div class="app__viewer">
			<Viewer :code="code" :selection="selection" />
		</div>
		<div class="app__control">
			<div class="app__editor">
				<Editor
					:code="code"
					:selection="selection"
					:activeRange="activeRange"
					:dark="dark"
					@input="onEdit"
					@select="onSelect"
				/>
			</div>
			<div class="app__console">
				<button class="app__console-toggle" @click="compact = !compact">&lt;</button>
				<Console :compact="compact" />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {Component, Vue, Watch} from 'vue-property-decorator'
import Color from 'color'

import Editor from '@/components/Editor.vue'
import Viewer from '@/components/Viewer.vue'
import Console from '@/components/Console.vue'

import {replEnv, REP, PRINT} from '@/impl/repl'
import {viewHandler} from '@/impl/view'
import {MalVal} from '@/impl/types'

import {replaceRange} from '@/utils'
import {printer} from './impl/printer'

@Component({
	components: {
		Editor,
		Viewer,
		Console
	}
})
export default class App extends Vue {
	private selection = [0, 0]
	private activeRange: [number, number] | null = null
	private code = ''
	private background = 'snow'
	private backgroundSet = false
	private compact = true

	onScroll(e: MouseWheelEvent) {
		// e.preventDefault()
	}

	private created() {
		const url = new URL(location.href)

		const queryCodeURL = url.searchParams.get('code_url')
		const queryCode = url.searchParams.get('code')

		this.compact = url.searchParams.has('compact')

		if (queryCodeURL) {
			const codeURL = decodeURI(queryCodeURL)
			url.searchParams.delete('code_url')
			url.searchParams.delete('code')

			const getCode = async () => {
				const res = await fetch(codeURL)
				if (res.ok) {
					const code = await res.text()
					this.code = `;; Loaded from "${codeURL}"\n\n${code}`
				} else {
					printer.error(`Failed to load from "${codeURL}"`)
				}

				history.pushState({}, document.title, url.pathname + url.search)
			}
			getCode()
		} else if (queryCode) {
			this.code = decodeURI(queryCode)
			url.searchParams.delete('code')
			history.pushState({}, document.title, url.pathname + url.search)
		} else {
			this.code =
				localStorage.getItem('saved_code') ||
				'(fill "black" (rect 50 50 50 50))'
		}

		replEnv.set('$canvas', this.code)

		viewHandler.on('$insert', (item: MalVal) => {
			const itemStr = PRINT(item)

			const [start, end] = this.selection
			const [code, ...selection] = replaceRange(this.code, start, end, itemStr)

			this.onEdit(code)
			this.selection = selection
		})

		viewHandler.on('set-background', (bg: string) => {
			let base

			try {
				base = Color(bg)
			} catch (err) {
				return
			}

			this.background = bg
			if (!this.backgroundSet) {
				setTimeout(() => (this.backgroundSet = true), 1)
			}
		})
	}

	private onEdit(value: string) {
		localStorage.setItem('saved_code', value)

		this.code = value
		replEnv.set('$canvas', value)
	}

	private onSelect(selection: [number, number]) {
		this.selection = selection

		// Find nearest parenthess
		let [start, end] = selection
		const code = this.code

		if (code[start] === '(') {
			start += 1
			end = Math.max(start, end)
		} else if (code[end - 1] === ')') {
			end -= 2
			start -= 1
		} else if (code[end] === ')') {
			end -= 1
		}

		const selectedCode = this.code.slice(start, end)
		const depthDiff =
			(selectedCode.match(/\(/g) || []).length -
			(selectedCode.match(/\)/g) || []).length

		function searchParenthesis(code: string, pos: number, reverse: boolean) {
			const open = reverse ? code.lastIndexOf('(', pos) : code.indexOf('(', pos)
			const close = reverse
				? code.lastIndexOf(')', pos)
				: code.indexOf(')', pos)

			if (open === -1 && close === -1) {
				return [-1, 0]
			} else if (open === -1) {
				return [close, -1]
			} else if (close === -1) {
				return [open, +1]
			} else {
				return reverse
					? [Math.max(open, close), close < open ? +1 : -1]
					: [Math.min(open, close), open < close ? +1 : -1]
			}
		}

		// Find nearest parenthesis
		for (
			let i = 1000, depth = Math.min(-1, depthDiff - 1);
			depth !== 0 && 0 < i;
			i--
		) {
			const [pos, inc] = searchParenthesis(code, --start, true)
			if (pos === -1) {
				start = -1
				break
			} else {
				start = pos
				depth += inc
			}
		}

		for (
			let i = 1000, depth = Math.max(1, depthDiff - 1);
			depth !== 0 && 0 < i;
			i--
		) {
			const [pos, inc] = searchParenthesis(code, ++end, false)
			if (pos === -1) {
				end = -1
				break
			} else {
				end = pos
				depth += inc
			}
		}

		this.activeRange = start !== -1 && end !== -1 ? [start, end] : null
	}

	private get dark() {
		return Color(this.background).isDark()
	}

	private get colors() {
		const brightColors = {
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

		const darkColors = {
			'--currentline': '#282a2e',
			'--selection': '#373b41',
			'--foreground': '#c5c8c6',
			'--comment': '#969896',
			'--red': '#cc6666',
			'--orange': '#de935f',
			'--yellow': '#f0c674',
			'--green': '#b5bd68',
			'--aqua': '#8abeb7',
			'--blue': '#81a2be',
			'--purple': '#b294bb'
		}

		const colors = this.dark ? darkColors : brightColors

		replEnv.set('$ui-border', colors['--selection'])

		return {...colors, '--background': this.background}
	}

	@Watch('background')
	private onBackgroundChanged() {
		replEnv.set('$ui-background', this.background)
	}
}
</script>

<style lang="stylus">
*, ::after, ::before
	box-sizing border-box
	outline none
	-webkit-tap-highlight-color transparent

html, body
	overflow hidden
	height 100vh
	--ease cubic-bezier(0.22, 0, 0.02, 1)

html
	font-size 12px
	font-family 'Fira Code', monospace

button
	outline none
	border none
	background none
	user-select none

#app
	display flex
	overflow hidden
	width 100%
	height 100vh
	background var(--background)
	color var(--foreground)
	text-align center
	transition background var(--tdur) var(--ease)
	--tdur 0
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale

	&.background-set
		--tdur 1s

$compact-dur = 0.4s

.app
	&__viewer
		position relative
		margin-right 1rem
		width 60%

		&:after
			position absolute
			top 1rem
			right -0.5rem
			bottom @top
			display block
			width 1px
			background var(--comment)
			content ''
			transition background var(--tdur) var(--ease)

	&__control
		position relative
		flex-grow 1

	&__editor
		position relative
		margin 1rem 0.5rem 1rem 1rem
		height calc(70% - 2rem)
		transition height $compact-dur var(--ease)

		&:after
			position absolute
			right 0
			bottom -0.5rem
			left -1rem
			display block
			height 1px
			background var(--comment)
			content ''
			transition background var(--tdur) var(--ease)

	&__console
		position absolute
		bottom 0
		margin 0.5rem 0.5rem 1rem 1rem
		width calc(100% - 1.5rem)
		height calc(30% - 1.5rem)
		transition height $compact-dur var(--ease)

		&-toggle
			$size = 2.5rem
			position absolute
			top -0.5rem
			right 0
			margin-top -0.5 * $size
			width $size
			height $size
			border 1px solid var(--comment)
			border-radius 50%
			background var(--background)
			color var(--comment)
			font-size 1.3rem
			transition all $compact-dur var(--ease)
			transform translateY(-0.5rem) rotate(-90deg)

			.compact &
				transform translateY(-0.5rem) rotate(90deg)

.compact .app__editor
	height calc(100% - 2rem - 2.2rem - 1.5rem)

.compact .app__console
	height 2.2rem
</style>
