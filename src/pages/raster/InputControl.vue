<template>
	<div class="InputControl">
		<template v-if="type === 'slider'">
			<InputSlider
				:modelValue="modelValue"
				:min="min"
				:max="max"
				:precision="2"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
		<template v-else-if="type === 'angle'">
			<InputRotery
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
		<template v-else-if="type === 'seed'">
			<InputSeed
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
		<template v-else-if="type === 'dropdown'">
			<InputDropdown
				:modelValue="modelValue"
				:items="items ? items.split(',') : null"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</template>
		<template v-else-if="type === 'cubicBezier'">
			<InputCubicBezier
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
import InputCubicBezier from '@/components/inputs/InputCubicBezier'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'

export default defineComponent({
	name: 'InputControl',
	components: {
		InputCheckbox,
		InputColor,
		InputCubicBezier,
		InputDropdown,
		InputRotery,
		InputSeed,
		InputSlider,
	},
	props: {
		type: {
			type: String as PropType<'slider' | 'color' | 'checkbox' | 'seed'>,
		},
		modelValue: {
			type: [Number, String, Boolean, Array, Object],
		},
		items: String,
		min: Number,
		max: Number,
	},
	emits: ['update:modelValue'],
})
</script>
