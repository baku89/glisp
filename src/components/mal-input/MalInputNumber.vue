<template>
	<div class="MalInputNumber">
		<InputNumber
			class="MalInputNumber__el"
			:value="value"
			@input="onInput"
			:validator="validator"
		/>
		<button
			class="MalInputNumber__drag"
			:style="{transform: `rotate(${value}rad)`}"
			ref="dragEl"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, watch, PropType} from '@vue/composition-api'
import InputNumber from '../input/InputNumber.vue'
import {MalNodeList} from '../../mal/types'
export default defineComponent({
	name: 'MalInputNumber',
	components: {InputNumber},
	props: {
		exp: {
			type: [Number, Array] as PropType<number | MalNodeList>,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(prop, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const onInput = (value: number) => {
			context.emit('input', value)
		}

		return {
			onInput
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../input/common.styl'

.MalInputNumber
	display flex
	align-items center
	line-height $input-height
</style>
