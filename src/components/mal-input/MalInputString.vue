<template>
	<InputString :value="value.value" :validator="validator" @input="onInput" />
</template>

<script lang="ts">
import {defineComponent, SetupContext} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal, MalSeq, MalSymbol} from '@/mal/types'
import {InputString} from '@/components/inputs'

interface Props {
	value: NonReactive<string | MalSeq | MalSymbol>
	validator: (v: string) => string | null
}

InputString

export default defineComponent({
	name: 'MalInputString',
	components: {
		InputString,
	},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
		validator: {
			required: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		function onInput(value: string) {
			context.emit('input', nonReactive(value))
		}

		return {onInput}
	},
})
</script>
