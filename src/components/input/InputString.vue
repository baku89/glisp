<template>
	<input class="InputString" type="text" :value="value" @input="onInput" />
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal} from '@/mal/types'
import {printExp} from '@/mal'

@Component({
	name: 'InputString'
})
export default class InputString extends Vue {
	@Prop({type: String, required: true}) private value!: MalVal
	@Prop({type: Boolean, default: true}) private allowBlank!: boolean

	onInput(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value

		if (!this.allowBlank && val.trim() === '') {
			return
		}

		this.$emit('input', val)
	}
}
</script>

<style lang="stylus" scoped>
.InputString
	width 8rem
	border none
	border-bottom 1px dashed var(--comment)
	background var(--background)
	color var(--green)
</style>
