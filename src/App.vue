<template>
	<div id="app">
		<div class="app__control">
			<div class="app__editor">
				<Editor v-model="source" />
			</div>
			<div class="app__console">
				<Console />
			</div>
		</div>
		<div class="app__viewer">
			<Viewer :source="source" />
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {Component, Vue} from 'vue-property-decorator'
import Editor from './components/Editor.vue'
import Viewer from './components/Viewer.vue'
import Console from './components/Console.vue'

@Component({
	components: {
		Editor,
		Viewer,
		Console
	}
})
export default class App extends Vue {
	source = 'Unco2'
}
</script>

<style lang="stylus">
html
	font-size 14px
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
	&__control, &__viewer
		width 50%

	&__editor, &__console
		height 50%
</style>
