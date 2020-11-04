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

import {PDGValue, setDirty} from './repl'

export default defineComponent({
	name: 'PDGInputBoolean',
	components: {InputCheckbox},
	props: {
		modelValue: {
			type: Object as PropType<PDGValue>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		function onUpdate(v: boolean) {
			const oldValue = toRaw(props.modelValue)
			setDirty(oldValue)

			const newValue: PDGValue = {...oldValue}
			newValue.value = v
			context.emit('update:modelValue', newValue)
		}

		return {onUpdate}
	},
})
</script>
