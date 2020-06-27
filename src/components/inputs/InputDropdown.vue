<template>
	<select class="InputDropdown" :value="value" @change="onChange">
		<option v-for="(value, index) in values" :key="index" :value="value">{{
			labels ? labels[index] : value
		}}</option>
	</select>
</template>

<script lang="ts">
import {defineComponent, PropType} from '@vue/composition-api'

export default defineComponent({
	name: 'InputDropdown',
	props: {
		value: {
			type: [String, Number] as PropType<string | number>,
			required: true
		},
		values: {
			type: Array as PropType<string[] | number[]>,
			required: true
		},
		labels: {
			type: Array as PropType<string[]>,
			required: false
		}
	},
	setup(props, context) {
		const onChange = (e: InputEvent) => {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = props.values[selectedIndex]
			context.emit('input', newValue)
		}

		return {
			onChange
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	input()
	padding-left 0
</style>
