<template>
	<div class="InputDropdown">
		<select
			class="InputDropdown__select"
			:value="modelValue"
			@change="onChange"
		>
			<option
				v-for="([value, label], index) in pairs"
				:key="index"
				:value="value"
			>
				{{ label }}
			</option>
		</select>
		<svg
			class="InputDropdown__chevron"
			viewBox="0 0 32 32"
			width="32"
			height="32"
		>
			<path d="M30 12 L16 24 2 12" />
		</svg>
	</div>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType} from 'vue'

export default defineComponent({
	name: 'InputDropdown',
	props: {
		modelValue: {
			type: [String, Number] as PropType<string | number>,
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
	},
	emits: ['update:modelValue', 'end-tweak'],
	setup(props, context) {
		const pairs = computed(() => {
			if (props.labels) {
				return _.zip(props.values, props.labels)
			} else {
				return props.values.map(v => [v, _.capitalize(v.toString())])
			}
		})

		function onChange(e: InputEvent) {
			const {selectedIndex} = e.target as HTMLSelectElement
			const newValue = props.values[selectedIndex]
			context.emit('update:modelValue', newValue)
			context.emit('end-tweak')
		}

		return {
			pairs,
			onChange,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	display inline-block

	&__select
		input()
		padding 0 0.4rem
		color var(--base06)
		appearance none

	&__chevron
		position absolute
		top 0
		right 0
		height 100%
		transform scale(0.4)
		transform-origin 80% 50%
		fill none
		stroke var(--base04)
		stroke-linecap round
		stroke-linejoin round
		stroke-width 3.5

	&.simple
		text-align-last center
</style>
