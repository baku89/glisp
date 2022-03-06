<template>
	<ul class="InputRadio">
		<li
			class="InputRadio__li"
			v-for="({value, label}, index) in completeItems"
			:key="index"
		>
			<input
				class="InputRadio__input"
				type="radio"
				:name="id"
				:id="value"
				@change="onChange"
				:checked="modelValue === value"
			/>
			<label class="InputRadio__label" :for="value">
				<slot name="option" :label="label" :value="value">
					<div class="style-default">
						{{ label }}
					</div>
				</slot>
			</label>
			>
		</li>
	</ul>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue'

interface Item {
	value: any
	label?: string
}

interface CompleteItem {
	value: any
	label: string
}

type ILabelizer = (v: any) => string

export default defineComponent({
	name: 'InputRadio',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		items: {
			type: Array as PropType<(Item | string | number | boolean | null)[]>,
			required: true,
		},
		capitalize: {
			type: Boolean,
			default: true,
		},
		labelize: {
			type: Function as PropType<ILabelizer>,
			default: (v: any) => v + '',
		},
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const id = ref(_.uniqueId('InputRadio_'))

		const completeItems = computed<CompleteItem[]>(() => {
			return props.items.map(it => {
				if (typeof it !== 'object' || it === null) {
					return {value: it, label: props.labelize(it)}
				}
				if (!it.label) {
					return {value: it.value, label: props.labelize(it.value)}
				}
				return it as CompleteItem
			})
		})

		function onChange(e: InputEvent) {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = completeItems.value[selectedIndex].value
			context.emit('update:modelValue', newValue)
		}

		return {
			id,
			completeItems,
			onChange,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputRadio
	position relative
	display flex
	overflow hidden
	// width 12.6em
	height $input-height
	border-radius $input-round
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

		.style-default
			padding 0 0.7em
			height 100%
			background base16('01')
			color base16('04')
			input-transition()
			text-align center

			&:hover
				background base16('accent', 0.5)

	&__input:checked + &__label .style-default
		border-radius $input-round
		background base16('accent')
		color base16('00')
</style>
