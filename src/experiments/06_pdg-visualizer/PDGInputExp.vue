<template>
	<div class="PDGInputExp">
		<component
			:is="type"
			:modelValue="modelValue"
			@update:modelValue="$emit('update:modelValue', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import PDGInputBoolean from './PDGInputBoolean.vue'
import PDGInputFncall from './PDGInputFncall.vue'
import PDGInputNumber from './PDGInputNumber.vue'
import {PDG} from './repl'

export default defineComponent({
	name: 'PDGInputExp',
	components: {
		number: PDGInputNumber,
		boolean: PDGInputBoolean,
		fncall: PDGInputFncall,
	},
	props: {
		modelValue: {
			type: Object as PropType<PDG>,
			required: true,
		},
	},
	setup(props) {
		const type = computed(() => {
			switch (props.modelValue.type) {
				case 'value':
					switch (typeof props.modelValue.value) {
						case 'number':
							return 'number'
						case 'boolean':
							return 'boolean'
					}
					break
				case 'fncall':
					return 'fncall'
			}
		})

		return {type}
	},
})
</script>

<style lang="stylus">
.PDGInputExp
	margin-bottom 0.3rem
</style>
