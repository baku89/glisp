<template>
	<div id="app" @mousewheel="onScroll" :style="colors">
		<div class="app__control">
			<div class="app__editor">
				<Editor
					:code="code"
					:selection="selection"
					:dark="dark"
					@input="onEdit"
					@select="onSelect"
				/>
			</div>
			<div class="app__console">
				<Console />
			</div>
		</div>
		<div class="app__viewer">
			<Viewer :timestamp="timestamp" />
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

@Component({
	components: {
		Editor,
		Viewer,
		Console
	}
})
export default class App extends Vue {
	private replEnv = replEnv.data

	private selection = [0, 0]
	private code = ''
	private timestamp: number = Date.now()
	private background = 'snow'

	onScroll(e: MouseWheelEvent) {
		// e.preventDefault()
	}

	private created() {
		this.code = localStorage['savedText'] || '(fill "black" (rect 50 50 50 50))'

		const value = this.code.replace(/"/g, '\\"')

		try {
			REP(`(set$ "${value}")`)
		} catch (err) {
			console.log('err')
		}
	}

	private mounted() {
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
		})
	}

	private onEdit(value: string) {
		localStorage['savedText'] = value

		this.code = value
		value = value.replace(/"/g, '\\"')
		try {
			REP(`(set$ "${value}")`)
		} catch (err) {
			console.log('err')
		}
	}

	private onSelect(selection: [number, number]) {
		this.selection = selection
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

		return {...colors, '--background': this.background}
	}

	@Watch('replEnv.$')
	private onViewChanged(value: string) {
		this.code = value
		this.timestamp = Date.now()
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

html
	font-size 12px
	font-family 'Fira Code', monospace

#app
	--tdur 1s

	display flex
	overflow hidden
	width 100%
	height 100vh
	background var(--background)
	color var(--foreground)
	text-align center
	transition background var(--tdur) ease
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale

.app
	&__control
		position relative
		margin-right 1rem
		width 40%

		&:after
			position absolute
			top 1rem
			right -0.5rem
			bottom @top
			display block
			width 1px
			background var(--selection)
			transition background var(--tdur) ease
			content ''

	&__editor, &__console
		height calc(50% - 1.5rem)

	&__editor
		position relative
		margin 1rem 0 1rem 1rem

		&:after
			position absolute
			right 0
			bottom -0.5rem
			left 1rem
			display block
			height 1px
			background var(--selection)
			transition background var(--tdur) ease
			content ''

	&__console
		margin 0 0 1rem 1rem

	&__viewer
		margin 1rem 1rem 1rem 0
		width 60%
</style>
