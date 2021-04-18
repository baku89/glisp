<template>
	<ul class="InputRadio">
		<li
			class="InputRadio__li"
			v-for="([value, label], index) in pairs"
			:key="index"
			:value="value"
		>
			<input
				class="InputRadio__input"
				type="radio"
				:name="id"
				:id="value"
				@change="onChange"
				:checked="modelValue === value"
			/>
			<label class="InputRadio__label" :for="value">{{ label }}</label>
		</li>
	</ul>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

export default defineComponent({
	name: 'InputRadio',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		values: {
			type: Array as PropType<string[]>,
			required: true,
		},
		labels: {
			type: Array as PropType<string[]>,
			required: false,
		},
		capitalize: {
			type: Boolean,
			default: true,
		},
	},
	setup(props, context) {
		const id = ref(_.uniqueId('InputRadio_'))

		const pairs = computed(() => {
			if (props.labels) {
				return _.zip(props.values, props.labels)
			} else {
				return props.values.map(v => [
					v,
					props.capitalize ? _.capitalize(v) : v,
				])
			}
		})

		function onChange(e: InputEvent) {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = props.values[selectedIndex]
			context.emit('update:modelValue', newValue)
		}

		return {
			id,
			pairs,
			onChange,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRadio
	position relative
	display flex
	overflow hidden
	width 12.6em
	height $input-height
	border-radius $input-round
	user-select none
	gap 1px

	&:focus-within
		box-shadow 0 0 0 1px base16('accent')

	&__li
		flex-grow 1

	&__input
		position absolute
		opacity 0

	&__label
		display block
		padding 0 0.7em
		height 100%
		background base16('01')
		color base16('04')
		input-transition()
		text-align center

		&:hover
			box-shadow inset 0 0 0 1px base16('accent')

	&__input:checked + &__label
		border-radius $input-round
		background base16('06')
		color base16('00')
</style>
