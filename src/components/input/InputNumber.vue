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
import {MalVal} from '@/mal/types'
import {printExp} from '@/mal'

@Component({
	name: 'InputNumber'
})
export default class InputNumber extends Vue {
	@Prop({type: Number, required: true}) private value!: number

	get step() {
		const [dec, float] = this.value.toString().split('.')

		return float !== undefined ? Math.pow(10, -float.length) : 1
	}

	onInput(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value
		const num = parseFloat(val)

		if (!isNaN(num)) {
			this.$emit('input', num)
		}
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
