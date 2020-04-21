<template>
	<div class="TreeList" :class="{'show-border': showBorder}">
		<div class="TreeList__item" v-for="(item, i) in ast" :key="i">
			<TreeList v-if="isList(item)" :ast="item" @input="onInput(i, $event)" />
			<TreeNumber v-else-if="isNumber(item)" :value="item" @input="onInput(i, $event)" />
			<TreeString v-else-if="isString(item)" :value="item" @input="onInput(i, $event)" />
			<div v-else class="TreeList__atom" :class="{symbol: isSymbol(item)}">{{ printExp(item) }}</div>
		</div>
	</div>
</template>


<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal, cloneAST, isKeyword, isSymbol} from '@/mal/types'
import {printExp} from '@/mal'

import TreeNumber from './TreeNumber.vue'
import TreeString from './TreeString.vue'

@Component({
	components: {
		TreeNumber,
		TreeString
	}
})
export default class TreeList extends Vue {
	@Prop({required: true}) private ast!: MalVal[]
	@Prop({type: Boolean, default: true}) private showBorder!: boolean

	isList(item: MalVal) {
		return Array.isArray(item)
	}

	isNumber(item: MalVal) {
		return typeof item === 'number'
	}

	isString(item: MalVal) {
		return typeof item === 'string' && !isSymbol(item) && !isKeyword(item)
	}

	isSymbol(item: MalVal) {
		return isSymbol(item)
	}

	printExp(item: MalVal) {
		return printExp(item)
	}

	onInput(i: number, val: MalVal) {
		const ast = [...this.ast]
		ast[i] = val
		this.$emit('input', ast)
	}
}
</script>

<style lang="stylus" scoped>
.TreeList
	position relative
	margin-bottom 1em
	line-height 1.5em

	&.show-border
		margin-left 0.5em

		&:before
			position absolute
			top 0
			bottom 0
			display block
			width 1em
			border-left 1px solid var(--comment)
			border-radius 0.5em
			content ''

	&__item
		margin-left 0.5rem

		&:first-child
			font-weight bold

	&__atom
		color var(--green)

		&.symbol
			color var(--blue)
</style>