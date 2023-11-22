<template>
	<GlispEditor
		v-model:selection="selection"
		v-model="sketch.code"
		class="ExprExpEditor"
		:activeRange="sketch.activeRange"
		:hoveringRange="sketch.hoveringRange"
	/>
</template>

<script lang="ts" setup>
import {ref, toRaw, watchEffect} from 'vue'

import GlispEditor from '@/components/GlispEditor'
import {ExprColl, findExpByRange as findExprByRange, TextRange} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

const sketch = useSketchStore()

const selection = ref<TextRange>([0, 0])

// Compute pre and post text
const preText = '(sketch;__\n'

watchEffect(() => {
	const [start, end] = selection.value

	const overwrappingExpr = findExprByRange(
		toRaw(sketch.expr as ExprColl),
		start + preText.length,
		end + preText.length
	)

	if (overwrappingExpr) {
		sketch.activeExpr = overwrappingExpr
	}
})
</script>
