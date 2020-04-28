<template>
	<div class="InputVec2">
		[
		<InputNumber
			class="InputVec2__el"
			:value="value[0]"
			:step="step"
			@input="onInput(0, $event)"
		/>
		<InputNumber
			class="InputVec2__el"
			:value="value[1]"
			:step="step"
			@input="onInput(1, $event)"
		/>]
		<!-- <div class="InputVec2__drag" /> -->
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal, createMalVector} from '@/mal/types'
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
		const value = createMalVector([...this.value])
		value[i] = v

		this.$emit('input', value)
	}
}
</script>

<style lang="stylus" scoped>
.InputVec2
	display flex

	&__el
		margin-right 0.5rem

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 1.3rem
		height 1.3rem
		border 1px solid var(--comment)

		&:before, &:after
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top 10%
			left 50%
			width 1px
			height 80%

		&:after
			top 50%
			left 10%
			width 80%
			height 1px
</style>
