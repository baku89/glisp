<template>
	<div class="TreeVector">
		<Tree v-for="(el, i) in value" :key="i" :value="el" @input="onInput(i, $event)" />
	</div>
</template>


<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {
	MalVal,
	cloneAST,
	isKeyword,
	isSymbol,
	isVector,
	MalVector,
	isList
} from '@/mal/types'
import {printExp} from '@/mal'

import Tree from './Tree.vue'

@Component({
	name: 'TreeVector',
	components: {
		Tree
	}
})
export default class TreeVector extends Vue {
	@Prop({type: Array, required: true}) private value!: MalVal[]

	get first() {
		return this.value[0]
	}

	get rest() {
		return this.value.slice(1)
	}

	printExp(item: MalVal) {
		return printExp(item)
	}

	onInput(i: number, val: MalVal) {
		const value = MalVector.from([...this.value])
		value[i] = val
		this.$emit('input', value)
	}
}
</script>

<style lang="stylus" scoped>
.TreeVector
	position relative
	text-align left
	line-height 1.5em

	&__rest
		margin-left 0.3em
		padding-left 0.5em
		border-left 1px solid var(--comment)
</style>