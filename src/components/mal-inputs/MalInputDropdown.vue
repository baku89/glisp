<template>
	<InputDropdown
		:value="value.value"
		:values="values"
		:labels="labels"
		@input="onInput"
	/>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import {InputDropdown} from '@/components/inputs'
import {MalVal} from '@/mal/types'

export default defineComponent({
	name: 'MalInputDropdown',
	components: {
		InputDropdown,
	},
	props: {
		value: {
			type: Object as PropType<MalVal>,
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
	setup(props, context) {
		function onInput(value: string | number) {
			context.emit('input', value)
			context.emit('end-tweak')
		}

		return {onInput}
	},
})
</script>
