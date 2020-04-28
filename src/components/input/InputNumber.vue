<template>
	<input
		class="InputNumber"
		type="number"
		:value="value"
		:step="step"
		@input="onInput"
	/>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'

@Component({
	name: 'InputNumber'
})
export default class InputNumber extends Vue {
	@Prop({type: Number, required: true}) private value!: number
	@Prop({type: Function}) private validator!: (v: number) => number | null

	get step() {
		const float = this.value.toString().split('.')[1]
		return float !== undefined ? Math.pow(10, -float.length) : 1
	}

	onInput(e: InputEvent) {
		const str = (e.target as HTMLInputElement).value
		let val: number | null = parseFloat(str)

		if (isNaN(val)) {
			return
		}

		if (this.validator) {
			const origVal = val

			val = this.validator(val)
			if (typeof val !== 'number' || isNaN(val)) {
				return
			}

			if (val !== origVal) {
				;(e.target as HTMLInputElement).value = val.toString()
			}
		}

		this.$emit('input', val)
	}
}
</script>

<style lang="stylus" scoped>
.InputNumber
	width 4rem
	border none
	border-bottom 1px dashed var(--comment)
	background var(--background)
	color var(--orange)
	font-size inherit
	text-align right
</style>
