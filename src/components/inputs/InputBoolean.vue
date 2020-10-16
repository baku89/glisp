<template>
	<div class="InputBoolean">
		<div class="InputBoolean__checkbox">
			<input
				:id="id"
				:checked="!!modelValue"
				@input="onInput"
				class="InputBoolean__input"
				type="checkbox"
			/>
			<div class="InputBoolean__frame">
				<i class="InputBoolean__checkmark fas fa-check" />
			</div>
		</div>
		<label class="InputBoolean__label" v-if="label" :for="id">{{
			label
		}}</label>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue'
import uid from 'uid'

export default defineComponent({
	name: 'InputBoolean',
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
		const id = ref('InputBoolean_' + uid())

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

.InputBoolean
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
		input-transition()

	&__frame
		position absolute
		top ($input-height - 1.2rem) * 0.5rem
		left @top
		width 1.2rem
		height 1.2rem
		border 1px solid var(--comment)
		border-radius 2px
		color transparent
		color var(--comment)
		line-height 1rem
		pointer-events none
		input-transition()

	&__checkmark
		top 0
		left 0
		width 100%
		height 100%
		text-align center
		text-indent 0.1rem
		font-size 0.8rem
		line-height 100%
		opacity 0
		pointer-events none

	&__input:checked + &__frame > &__checkmark
		opacity 1

	// Hover
	&__input:hover + &__frame, &__input:focus + &__frame
		border-color var(--highlight)
		color var(--highlight)

	// Label
	&__label
		margin-left 0.3em
		color var(--textcolor)
		user-select none

	// Exp
	&.exp > &__frame
		border-color var(--red)
		color var(--red)
</style>
