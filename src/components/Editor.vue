<template>
	<div class="Editor">
		<InputCodeEditor
			class="Editor__input"
			:value="code"
			:selection="selection"
			:activeRange="activeRange"
			:theme="dark ? 'tomorrow_night' : 'tomorrow'"
			@input="$emit('input', $event)"
			@select="$emit('select', $event)"
			@select-outer="$emit('select-outer')"
			lang="clojure"
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
	@Prop({required: true}) private activeRange!: [number, number] | null
	@Prop({type: Boolean, default: false}) private dark!: boolean
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
		border 1px solid red
		border 0
		font-size 1rem
		font-family monospace
</style>
