<template>
	<select class="InputDropdown" :value="value" @change="onChange">
		<option v-for="(v, index) in values" :key="index" :value="value">
			{{ labels ? labels[index] : v }}
		</option>
	</select>
</template>

<script lang="ts" setup>
const props = defineProps<{
	value: string
	values: string[]
	labels?: string[]
}>()

const emit = defineEmits<{
	input: [value: string]
	'end-tweak': []
}>()

function onChange(e: Event) {
	const {selectedIndex} = e.target as HTMLSelectElement
	const newValue = props.values[selectedIndex]
	emit('input', newValue)
	emit('end-tweak')
}
</script>

<style lang="stylus">
@import '../style/common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	input()
	padding 0

	&.simple
		text-align-last center
		appearance none
</style>
