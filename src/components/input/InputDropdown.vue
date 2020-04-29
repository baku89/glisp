<template>
	<select class="InputDropdown" :value="value" @change="onChange">
		<option
			v-for="(value, index) in values"
			:key="index"
			:value="value"
		>{{labels ? labels[index] : value}}</option>
	</select>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'

type ValueType = string | number

@Component({
	name: 'InputDropdown'
})
export default class InputDropdown extends Vue {
	@Prop([String, Number]) private value!: ValueType
	@Prop(Array) private values!: ValueType[]
	@Prop(Array) private labels!: string[]

	private onChange(e: Event) {
		const {selectedIndex} = e.target as HTMLSelectElement
		const newValue = this.values[selectedIndex]
		this.$emit('input', newValue)
	}
}
</script>


<style lang="stylus" scoped>
@import './common.styl'

$right-arrow-width = 1em

.InputDropdown
	position relative
	input()
	padding-left 0
</style>