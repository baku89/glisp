<template>
	<div class="InputVec2">
		<InputNumber class="InputVec2__el" :value="value[0]" :step="step" @input="onInput(0, $event)" />
		<InputNumber class="InputVec2__el" :value="value[1]" :step="step" @input="onInput(1, $event)" />
	</div>
</template>


<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal, MalVector} from '@/mal/types'
import {printExp} from '@/mal'
import InputNumber from './InputNumber.vue'

@Component({
	name: 'InputVec2',
	components: {
		InputNumber
	}
})
export default class InputVec2 extends Vue {
	@Prop({type: Array, required: true}) private value!: [number, number]

	get step() {
		const [dec, float] = this.value.toString().split('.')
		return float !== undefined ? Math.pow(10, -float.length) : 1
	}

	onInput(i: number, v: number) {
		const value = MalVector.from([...this.value])
		value[i] = v

		this.$emit('input', value)
	}
}
</script>

<style lang="stylus" scoped>
.InputVec2
	display flex

	&__el
		margin-right 1rem

		&:last-child
			margin-right 0
</style>