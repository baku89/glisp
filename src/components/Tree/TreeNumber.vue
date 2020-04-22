<template>
	<input class="TreeNumber" type="number" :value="value" :step="step" @input="onInput" />
</template>


<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal} from '@/mal/types'
import {printExp} from '@/mal'

@Component({
	name: 'TreeNumber'
})
export default class TreeNumber extends Vue {
	@Prop({type: Number, required: true}) private value!: number

	get step() {
		const [dec, float] = this.value.toString().split('.')

		return float !== undefined ? Math.pow(10, -float.length) : 1
	}

	onInput(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value
		const num = parseFloat(val)

		if (!isNaN(num)) {
			this.$emit('input', num)
		}
	}
}
</script>

<style lang="stylus" scoped>
.TreeNumber
	width 4rem
	border 1px solid var(--comment)
	background var(--background)
	color var(--orange)
</style>