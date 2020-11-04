<template>
	<div class="PDGVisualizer" ref="el" />
</template>

<script lang="ts">
import {defineComponent, PropType, ref, toRaw, watch} from 'vue'

import {PDG} from './repl'
import {showPDG} from './utils'

export default defineComponent({
	name: 'PDGVisualizer',
	props: {
		modelValue: {
			type: Object as PropType<PDG>,
			required: true,
		},
	},
	setup(props) {
		const el = ref<null | HTMLElement>(null)

		watch(
			() => [props.modelValue, el.value],
			() => {
				console.log('VIS!!!', toRaw(props.modelValue))
				if (el.value) {
					showPDG(props.modelValue, el.value)
				}
			},
			{immediate: true}
		)

		return {el}
	},
})
</script>
