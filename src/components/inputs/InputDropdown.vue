<template>
	<select class="InputDropdown" :value="modelValue" @change="onChange">
		<option v-for="(value, index) in values" :key="index" :value="value">
			{{ labels ? labels[index] : value }}
		</option>
	</select>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

export default defineComponent({
	name: 'InputDropdown',
	props: {
		modelValue: {
			type: [String, Number] as PropType<string | number>,
			required: true,
		},
		values: {
			type: Array as PropType<string[] | number[]>,
			required: true,
		},
		labels: {
			type: Array as PropType<string[]>,
			required: false,
		},
	},
	emits: ['update:modelValue', 'end-tweak'],
	setup(props, context) {
		function onChange(e: InputEvent) {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = props.values[selectedIndex]
			context.emit('update:modelValue', newValue)
			context.emit('end-tweak')
		}

		return {
			onChange,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	input()
	padding 0

	&.simple
		text-align-last center
		appearance none
</style>
