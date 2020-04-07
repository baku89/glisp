<template>
	<div class="Editor">
		<InputCodeEditor :value="worldCode" @input="onInput" lang="lisp" />
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'

import InputCodeEditor from './InputCodeEditor.vue'

import {replEnv, PRINT, REP} from '@/impl/repl'
import {MalVal} from '../impl/types'
import Env, {EnvData} from '../impl/env'

@Component({
	components: {
		InputCodeEditor
	}
})
export default class Editor extends Vue {
	private envData: EnvData = replEnv.data

	private worldCode: string = PRINT(replEnv.get('$'))

	private edited!: boolean

	private created() {
		if (localStorage['savedText']) {
			console.log('laod', localStorage['savedText'])
			this.onInput(localStorage['savedText'])
		} else {
			this.onEnvChanged()
		}
	}

	@Watch('envData.$')
	private onEnvChanged() {
		if (!this.edited) {
			console.log('env changed by outer force')
			this.worldCode = PRINT(replEnv.get('$'))
		}
		this.edited = false
	}

	private onInput(value: string) {
		this.edited = true
		localStorage['savedText'] = value

		try {
			REP(`(def! $ '(do ${value}))`)
		} catch (e) {
			this.edited = false
		}
	}
}
</script>

<style lang="stylus" scoped>
.Editor
	position relative
	height 100%

	&__input
		width 100%
		height 100%
		outline none
		border 0
		font-size 1rem
		font-family monospace
</style>
