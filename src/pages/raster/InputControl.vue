<template>
	<div class="InputControl">
		<template v-if="type === 'slider'">
			<InputSlider
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
		<template v-else-if="type === 'color'">
			<InputColor
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
		<template v-else-if="type === 'checkbox'">
			<InputCheckbox
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputColor from '@/components/inputs/InputColor.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'

export default defineComponent({
	name: 'InputControl',
	components: {
		InputSlider,
		InputCheckbox,
		InputColor,
	},
	props: {
		type: {
			type: String as PropType<'slider' | 'color'>,
		},
		modelValue: {
			type: [Number, String, Boolean, Array, Object],
		},
	},
	emits: ['update:modelValue'],
})
</script>
