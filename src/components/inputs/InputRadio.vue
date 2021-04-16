<template>
	<div class="InputRadio">
		<div v-for="([value, label], index) in pairs" :key="index" :value="value">
			<input
				type="radio"
				:name="id"
				:id="value"
				@change="onChange"
				:checked="modelValue === value"
			/>
			<label :for="value">{{ label }}</label>
		</div>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

export default defineComponent({
	name: 'InputRadio',
	props: {
		modelValue: {
			type: Boolean,
			required: true,
		},
		values: {
			type: Array as PropType<string[]>,
			required: true,
		},
		labels: {
			type: Array as PropType<string[]>,
			required: false,
		},
	},
	setup(props, context) {
		const id = ref(_.uniqueId('InputRadio_'))

		const pairs = computed(() => {
			if (props.labels) {
				return _.zip(props.values, props.labels)
			} else {
				return props.values.map(v => [v, _.capitalize(v.toString())])
			}
		})

		function onChange(e: InputEvent) {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = props.values[selectedIndex]
			context.emit('update:modelValue', newValue)
		}

		return {
			id,
			pairs,
			onChange,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRadio
	position relative
	display flex
	overflow hidden
	height $input-height
	border-radius $border-radius

	&:focus-within
		box-shadow 0 0 0 1px var(--accent)

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
			box-shadow inset 0 0 0 1px var(--accent)

	input:checked + label
		border-radius $border-radius
		background base16('06')
		color base16('00')
</style>
