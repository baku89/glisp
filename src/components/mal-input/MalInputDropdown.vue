<template>
	<InputDropdown
		:value="value.value"
		:values="values"
		:labels="labels"
		@input="onInput"
	/>
</template>

<script lang="ts">
import {defineComponent, SetupContext} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal} from '@/mal/types'
import {PropType} from 'vue'
import {InputDropdown} from '@/components/inputs'

interface Props {
	value: NonReactive<MalVal>
	values: PropType<string[] | number[]>
	labels: string[]
}

export default defineComponent({
	name: 'MalInputDropdown',
	components: {
		InputDropdown,
	},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		values: {
			type: Array,
			required: true,
		},
		labels: {
			type: Array,
			required: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		function onInput(value: string) {
			context.emit('input', nonReactive(value))
		}

		return {onInput}
	},
})
</script>
