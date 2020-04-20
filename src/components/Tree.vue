<template>
	<button class="Tree" @click="onClick">{{code}}</button>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal, cloneAST} from '../mal/types'
import {printExp} from '../mal'

@Component({})
export default class Tree extends Vue {
	@Prop({required: true}) private ast!: MalVal

	mounted() {
		console.log('mounted')
	}

	public get code() {
		return printExp(this.ast)
	}

	private onClick() {
		console.log('update')
		const ast = cloneAST(this.ast)
		;(ast as any)[2][1][2][3] += 1
		this.$emit('update', ast)
	}
}
</script>

<style lang="stylus" scoped>
.Tree
	position relative
	z-index 10000
	height 100%
	background green
</style>
