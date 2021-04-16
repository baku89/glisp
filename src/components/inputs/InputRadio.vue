<template>
	<div class="InputRadio">
		<div>
			<input type="radio" :name="id" id="Left" />
			<label for="Left">Left</label>
		</div>
		<div>
			<input type="radio" :name="id" id="Center" />
			<label for="Center">Center</label>
		</div>
		<div>
			<input type="radio" :name="id" id="Right" />
			<label for="Right">Right</label>
		</div>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {defineComponent, ref} from 'vue'

export default defineComponent({
	name: 'InputRadio',
	props: {
		modelValue: {
			type: Boolean,
			required: true,
		},
	},
	setup(props, context) {
		const id = ref(_.uniqueId('InputRadio_'))

		function onInput(e: InputEvent) {
			const value = (e.target as HTMLInputElement).checked
			context.emit('update:modelValue', value)
		}

		return {id, onInput}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRadio
	display flex
	overflow hidden
	height $input-height
	border-radius $border-radius

	input
		position absolute
		opacity 0

	label
		display block
		padding 0 0.7em
		height 100%
		background base16('01')
		color base16('04')
		input-transition()

		&:hover
			box-shadow inset 0 0 0 1px var(--highlight)

	input:checked + label
		border-radius $border-radius
		background base16('06')
		color base16('00')
</style>
