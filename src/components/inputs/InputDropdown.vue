<template>
	<select class="InputDropdown" :value="modelValue" @change="onChange">
		<option
			v-for="([value, label], index) in pairs"
			:key="index"
			:value="value"
		>
			{{ label }}
		</option>
	</select>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType} from 'vue'

export default defineComponent({
	name: 'InputDropdown',
	props: {
		modelValue: {
			type: [String, Number] as PropType<string | number>,
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
	emits: ['update:modelValue', 'end-tweak'],
	setup(props, context) {
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
			context.emit('end-tweak')
		}

		return {
			pairs,
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
	color var(--base06)

	&.simple
		text-align-last center
		appearance none
</style>
