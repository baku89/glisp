<template>
	<div class="Editor">
		<InputCodeEditor
			:value="code"
			:selection="selection"
			@input="$emit('input', $event)"
			@select="$emit('select', $event)"
			lang="lisp"
		/>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'

import InputCodeEditor from './InputCodeEditor.vue'

@Component({
	components: {
		InputCodeEditor
	}
})
export default class Editor extends Vue {
	@Prop({type: String, required: true}) private code!: string
	@Prop({type: Array, required: true}) private selection!: [number, number]
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
