<template>
	<div class="PDGInputSymbol">
		<InputString :modelValue="modelValue.name" @update:modelValue="onUpdate" />
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, toRaw} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import {PDGSymbol, setDirty} from './repl'

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

			const resolved = props.modelValue.resolved
			if (resolved?.result === 'succeed') {
				resolved.ref.dep.delete(oldValue)
				resolved.ref.dep.add(newValue)
			}

			newValue.resolved = undefined
			newValue.name = v
			context.emit('update:modelValue', newValue)
		}

		return {onUpdate}
	},
})
</script>
