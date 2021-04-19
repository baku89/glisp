<template>
	<div class="InputCheckbox">
		<div class="InputCheckbox__checkbox">
			<input
				:id="id"
				:checked="!!modelValue"
				@input="onInput"
				class="InputCheckbox__input"
				type="checkbox"
			/>
			<div class="InputCheckbox__frame">
				<SvgIcon mode="block" class="InputCheckbox__checkmark">
					<path d="M2 20 L12 28 30 4" />
				</SvgIcon>
			</div>
		</div>
		<label class="InputCheckbox__label" v-if="label" :for="id">{{
			label
		}}</label>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {defineComponent, ref} from 'vue'

import SvgIcon from '@/components/layouts/SvgIcon.vue'

export default defineComponent({
	name: 'InputCheckbox',
	components: {
		SvgIcon,
	},
	props: {
		modelValue: {
			type: Boolean,
			required: true,
		},
		label: {
			type: String,
		},
	},
	setup(props, context) {
		const id = ref(_.uniqueId('InputCheckbox_'))

		function onInput(e: InputEvent) {
			const value = (e.target as HTMLInputElement).checked
			context.emit('update:modelValue', value)
		}

		return {id, onInput}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputCheckbox
	display flex
	align-items center

	&__checkbox
		position relative
		width $input-height
		height $input-height

	&__input
		display block
		width $input-height
		height $input-height
		opacity 0

	&__frame
		position absolute
		top 0
		left 0
		width 100%
		height 100%
		border-radius $input-round
		background base16('01')
		color transparent
		color base16('04')
		line-height 1em
		pointer-events none

	&__checkmark
		position relative
		top 10%
		left 10%
		width 80%
		height 80%
		color base16('06')
		text-align center
		line-height $input-height
		opacity 0
		pointer-events none

	&__input:checked + &__frame > &__checkmark
		opacity 1

	// Hover and Focus
	&:hover &__frame
		box-shadow inset 0 0 0 1px base16('accent')
		color base16('accent')

	&:focus-within &__frame
		box-shadow inset 0 0 0 1px base16('accent'), 0 0 0 1px base16('accent')

	// Label
	&__label
		margin-left 0.3em
		color base16('05')
		user-select none

	// Exp
	&.exp > &__frame
		border-color var(--red)
		color var(--red)
</style>
