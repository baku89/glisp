<template>
	<TreeList v-if="isList(value)" :value="value" @input="onInput" />
	<TreeVector v-else-if="isVector(value)" :value="value" @input="onInput" />
	<TreeNumber v-else-if="isNumber(value)" :value="value" @input="onInput" />
	<TreeString v-else-if="isString(value)" :value="value" @input="onInput" />
	<div v-else class="TreeList__atom" :class="{symbol: isSymbol(value)}">
		{{ printExp(value) }}
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {
	MalVal,
	cloneAST,
	isSymbol,
	isKeyword,
	isList,
	isVector
} from '@/mal/types'
import {printExp} from '@/mal'

import TreeList from './TreeList.vue'
import TreeVector from './TreeVector.vue'
import TreeNumber from './TreeNumber.vue'
import TreeString from './TreeString.vue'

@Component({
	name: 'Tree',
	components: {
		TreeList,
		TreeVector,
		TreeString,
		TreeNumber
	}
})
export default class Tree extends Vue {
	@Prop({required: true}) private value!: MalVal

	isList(item: MalVal) {
		return isList(item)
	}

	isVector(item: MalVal) {
		return isVector(item)
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

	private onInput(val: MalVal) {
		this.$emit('update', val)
	}
}
</script>

<style lang="stylus" scoped>
.Tree
	position relative
	overflow scroll
	height 100%
	text-align left
</style>
