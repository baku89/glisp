<template>
	<div class="InputBoolean">
		<input type="checkbox" :checked="!!value" @input="onInput" />
	</div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'

export default defineComponent({
	name: 'InputBoolean',
	props: {
		value: {
			type: Boolean,
			required: true,
		},
	},
	setup(props, context) {
		function onInput(e: InputEvent) {
			const value = (e.target as HTMLInputElement).checked
			context.emit('input', value)
		}

		return {onInput}
	},
})
</script>
