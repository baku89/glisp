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
				<svg
					class="InputCheckbox__checkmark"
					viewBox="0 0 32 32"
					width="32"
					height="32"
					fill="none"
					stroke="currentcolor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3.5"
				>
					<path d="M2 20 L12 28 30 4" />
				</svg>
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

export default defineComponent({
	name: 'InputCheckbox',
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
		border-radius 2px
		background var(--base01)
		color transparent
		color var(--base04)
		line-height 1em
		pointer-events none

	&__checkmark
		position relative
		top 10%
		left 10%
		width 80%
		height 80%
		color var(--base06)
		text-align center
		line-height $input-height
		opacity 0
		pointer-events none

	&__input:checked + &__frame > &__checkmark
		opacity 1

	// Hover and Focus
	&:hover &__frame
		box-shadow inset 0 0 0 1px var(--highlight)
		color var(--highlight)

	&:focus-within &__frame
		box-shadow inset 0 0 0 1px var(--highlight), 0 0 0 1px var(--highlight)

	// Label
	&__label
		margin-left 0.3em
		color var(--base05)
		user-select none

	// Exp
	&.exp > &__frame
		border-color var(--red)
		color var(--red)
</style>
