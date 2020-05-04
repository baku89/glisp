<template>
	<div class="InputVec2">
		[
		<InputNumber
			class="InputVec2__el"
			:value="value[0]"
			@input="onInput(0, $event)"
		/>
		<InputNumber
			class="InputVec2__el"
			:value="value[1]"
			@input="onInput(1, $event)"
		/>]
		<!-- <div class="InputVec2__drag" /> -->
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import {createMalVector} from '@/mal/types'
import InputNumber from './InputNumber.vue'

interface Props {
	value: [number, number]
}

export default defineComponent({
	name: 'InputVec2',
	components: {InputNumber},
	props: {
		value: {
			type: Array,
			required: true
		}
	},
	setup(props: Props, context) {
		const onInput = (i: number, v: number) => {
			const value = createMalVector([...props.value])
			value[i] = v

			context.emit('input', value)
		}

		return {
			onInput
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputVec2
	display flex
	line-height $input-height

	&__el
		margin-right 0.5em
		width 5em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 1.3rem
		height 1.3rem
		border 1px solid var(--comment)

		&:before, &:after
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top 10%
			left 50%
			width 1px
			height 80%

		&:after
			top 50%
			left 10%
			width 80%
			height 1px
</style>
