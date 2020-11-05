<template>
	<div class="PDGInputSymbol">
		<InputString :modelValue="modelValue.name" @update:modelValue="onUpdate" />
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import {deleteAllDups, PDGSymbol, setDirty} from './repl'

export default defineComponent({
	name: 'PDGInputSymbol',
	components: {InputString},
	props: {
		modelValue: {
			type: Object as PropType<PDGSymbol>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		function onUpdate(v: string) {
			const oldValue = toRaw(props.modelValue)
			setDirty(oldValue)
			const newValue: PDGSymbol = {...oldValue}

			deleteAllDups(oldValue)

			newValue.resolved = undefined
			newValue.name = v
			context.emit('update:modelValue', newValue)
		}

		return {onUpdate}
	},
})
</script>
