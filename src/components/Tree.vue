<template>
	<div class="Tree">
		<TreeList :ast="ast" @input="onInput" :show-border="false" />
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import TreeList from './trees/TreeList.vue'
import {MalVal, cloneAST} from '@/mal/types'
import {printExp} from '@/mal'

@Component({
	components: {
		TreeList
	}
})
export default class Tree extends Vue {
	@Prop({required: true}) private ast!: MalVal

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
