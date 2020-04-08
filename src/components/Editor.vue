<template>
	<div class="Editor">
		<InputCodeEditor :value="code" @input="onInput" lang="lisp" />
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

	private code: string = PRINT(replEnv.get('$'))

	private userEdited!: boolean

	private created() {
		if (localStorage['savedText']) {
			this.code = localStorage['savedText']
		} else {
			this.onEnvChanged()
		}
	}

	@Watch('envData.$')
	private onEnvChanged() {
		if (this.userEdited) {
			this.userEdited = false
			return
		}

		const ast = replEnv.get('$')

		let _,
			lines = [ast]

		if (Array.isArray(ast) && ast[0] === Symbol.for('do')) {
			;[_, ...lines] = ast
		}

		this.code = lines.map(line => PRINT(line)).join('\n')
	}

	private onInput(value: string) {
		this.userEdited = true
		localStorage['savedText'] = value

		try {
			REP(`(def! $ '(do ${value}))`)
		} catch (e) {
			this.userEdited = false
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
