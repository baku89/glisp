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
import {NonReactive, nonReactive} from '@/utils'
import {MalVal} from '@/mal/types'
import {InputDropdown} from '@/components/inputs'

export default defineComponent({
	name: 'MalInputDropdown',
	components: {
		InputDropdown,
	},
	props: {
		value: {
			type: Object as PropType<NonReactive<MalVal>>,
			required: true,
			validator: (x: NonReactive<MalVal>) => x instanceof NonReactive,
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
			context.emit('input', nonReactive(value))
			context.emit('end-tweak')
		}

		return {onInput}
	},
})
</script>
