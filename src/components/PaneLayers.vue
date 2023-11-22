<script lang="ts" setup>
import {computed} from 'vue'

import {cloneExpr, ExprColl, ExprList} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import ViewExprTree from './ViewExprTree.vue'

const sketch = useSketchStore()

const children = computed(() => sketch.expr.slice(1))

function onUpdateChild(i: number, replaced: ExprColl) {
	const newExpr = cloneExpr(sketch.expr as ExprList) as ExprList
	newExpr[i + 1] = replaced
	sketch.expr = newExpr
}
</script>

<template>
	<ViewExprTree
		v-for="(child, i) in children"
		:key="i"
		:expr="child"
		@update:exp="onUpdateChild(i, $event)"
	/>
</template>
