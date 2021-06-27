<template>
	<component
		:is="ui"
		v-bind="{...$props, ...$attrs}"
		@update:modelValue="$emit('update:modelValue', $event)"
	/>
</template>

<script lang="ts">
import * as O from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, PropType} from 'vue'

import {Validator} from '@/lib/fp'

import InputNumberRanged from './InputNumberRanged.vue'
import InputNumberUnranged from './InputNumberUnranged.vue'

export default defineComponent({
	name: 'InputNumber',
	components: {
		unranged: InputNumberUnranged,
		ranged: InputNumberRanged,
	},
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
		min: {
			type: Number,
		},
		max: {
			type: Number,
		},
		precision: {
			type: Number,
			default: 1,
		},
		sliderOrigin: {
			type: Number,
			default: 0,
		},
		validator: {
			type: Function as PropType<Validator<number>>,
			default: O.some,
		},
	},
	emits: ['update:modelValue'],
	inheritAttrs: false,
	setup(props, context) {
		const ui = computed(() =>
			_.isNumber(props.min) && _.isNumber(props.max) ? 'ranged' : 'unranged'
		)

		return {ui}
	},
})
</script>
