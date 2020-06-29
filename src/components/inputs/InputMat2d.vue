<template>
	<div class="InputMat2d">
		<div class="InputMat2d__column">
			[
			<InputNumber
				class="InputMat2d__el"
				:value="value[0]"
				@input="onInput(0, $event)"
			/>
			<InputNumber
				class="InputMat2d__el"
				:value="value[2]"
				@input="onInput(2, $event)"
			/>
			|
			<InputNumber
				class="InputMat2d__el"
				:value="value[4]"
				@input="onInput(4, $event)"
			/>]
		</div>
		<div class="InputMat2d__column">
			[
			<InputNumber
				class="InputMat2d__el"
				:value="value[1]"
				@input="onInput(1, $event)"
			/>
			<InputNumber
				class="InputMat2d__el"
				:value="value[3]"
				@input="onInput(3, $event)"
			/>
			|
			<InputNumber
				class="InputMat2d__el"
				:value="value[5]"
				@input="onInput(5, $event)"
			/>]
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType} from '@vue/composition-api'
import InputNumber from './InputNumber.vue'

export default defineComponent({
	name: 'InputMat2d',
	components: {InputNumber},
	props: {
		value: {
			type: Array as PropType<number[]>,
			required: true
		}
	},
	setup(props, context) {
		const onInput = (i: number, v: number) => {
			const value = [...props.value]
			value[i] = v

			context.emit('input', value)
		}

		return {
			onInput
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputMat2d
	line-height $input-height

	&__column
		display flex
		margin-top .2em

		&:first-child
			margin-top none


	&__el
		margin-right 0.5em
		width 3em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 1.1rem
		height @width
		border 1px solid var(--comment)

		&:hover, &.dragging
			background var(--comment)

			&:before, &:after
				background var(--background)

		&:before, &:after
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top 2px
			left calc(50% - 0.5px)
			width 1px
			height calc(100% - 4px)

		&:after
			top calc(50% - 0.5px)
			left 2px
			width calc(100% - 4px)
			height 1px
</style>
