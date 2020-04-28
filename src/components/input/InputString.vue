<template>
	<input
		class="InputString"
		type="text"
		:value="value"
		@input="onInput"
		@blur="onBlur"
	/>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'

@Component({
	name: 'InputString'
})
export default class InputString extends Vue {
	@Prop({type: String, required: true}) private value!: string
	@Prop({type: Function}) private validator!: (v: string) => string | null

	onInput(e: InputEvent) {
		let val: string | null = (e.target as HTMLInputElement).value

		if (this.validator) {
			val = this.validator(val)
			if (!val) {
				return
			}
		}

		this.$emit('input', val)
	}

	onBlur() {
		;(this.$el as HTMLInputElement).value = this.value
	}
}
</script>

<style lang="stylus" scoped>
.InputString
	width 8rem
	border none
	border-bottom 1px dashed var(--comment)
	background var(--background)
	color var(--green)
</style>
