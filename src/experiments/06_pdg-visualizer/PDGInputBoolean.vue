<template>
	<div class="PDGInputBoolean">
		<InputCheckbox
			:modelValue="modelValue.value"
			@update:modelValue="onUpdate"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputCheckbox from '@/components/inputs/InputCheckbox.vue'

import {PDGValue, swapPDG} from './repl'

export default defineComponent({
	name: 'PDGInputBoolean',
	components: {InputCheckbox},
	props: {
		modelValue: {
			type: Object as PropType<PDGValue>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		function onUpdate(v: boolean) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {...oldValue, value: v}

			swapPDG(oldValue, newValue)
		}

		return {onUpdate}
	},
})
</script>
