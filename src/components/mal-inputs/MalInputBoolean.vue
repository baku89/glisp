<template>
	<inputBoolean :value="!!value.value" @input="onInput" />
</template>

<script lang="ts">
import {defineComponent, SetupContext} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalSeq, MalSymbol} from '@/mal/types'
import {InputBoolean} from '@/components/inputs'

interface Props {
	value: NonReactive<boolean | MalSeq | MalSymbol>
}

export default defineComponent({
	name: 'MalInputBoolean',
	components: {
		InputBoolean,
	},
	props: {
		value: {
			required: true,
			validator: x => x instanceof NonReactive,
		},
	},
	setup(props: Props, context: SetupContext) {
		function onInput(value: boolean) {
			context.emit('input', nonReactive(value))
			context.emit('end-tweak')
		}

		return {onInput}
	},
})
</script>

<style lang="stylus"></style>
