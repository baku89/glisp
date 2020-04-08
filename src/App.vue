<template>
	<div id="app" @mousewheel="onScroll">
		<div class="app__control">
			<div class="app__editor">
				<Editor :code="code" @input="onEdit" />
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
import Editor from './components/Editor.vue'
import Viewer from './components/Viewer.vue'
import Console from './components/Console.vue'

import {replEnv, REP} from '@/impl/repl'

@Component({
	components: {
		Editor,
		Viewer,
		Console
	}
})
export default class App extends Vue {
	private replEnv = replEnv.data
	private code = ''
	private timestamp: number = Date.now()

	onScroll(e: MouseWheelEvent) {
		// e.preventDefault()
	}

	private created() {
		if (localStorage['savedText']) {
			this.code = localStorage['savedText']
		} else {
			this.code = '(fill "black" (rect 50 50 50 50))'
		}
	}

	private onEdit(value: string) {
		localStorage['savedText'] = value

		value = value.replace(/"/g, '\\"')

		let succeed = true

		try {
			REP(`(set$ "${value}")`)
		} catch (e) {
			succeed = false
		}
	}

	@Watch('replEnv.$')
	private onViewChanged(value: string) {
		console.log('updateddddddd')
		this.code = value
		this.timestamp = Date.now()
	}
}
</script>

<style lang="stylus">
html, body
	overflow hidden
	height 100vh

html
	font-size 12px
	font-family 'Roboto', Helvetica, Arial, sans-serif

#app
	display flex
	overflow hidden
	width 100%
	height 100vh
	color #2c3e50
	text-align center
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale

.app
	&__control
		width 40%

	&__viewer
		width 60%

	&__editor, &__console
		height 50%
</style>
