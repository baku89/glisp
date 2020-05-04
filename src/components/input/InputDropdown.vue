<template>
	<select class="InputDropdown" :value="value" @change="onChange">
		<option v-for="(value, index) in values" :key="index" :value="value">{{
			labels ? labels[index] : value
		}}</option>
	</select>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'

type ValueType = string | number

interface Props {
	value: ValueType
	values: ValueType[]
	labels?: string[]
}

export default defineComponent({
	name: 'InputDropdown',
	props: {
		value: {
			type: [String, Number],
			required: true
		},
		values: {
			type: Array,
			required: true
		},
		labels: {
			type: Array,
			required: false
		}
	},
	setup(props: Props, context) {
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

<style lang="stylus" scoped>
@import './common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	input()
	padding-left 0
</style>
