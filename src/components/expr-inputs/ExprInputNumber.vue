<template>
	<Tq.InputNumber :modelValue="literalValue" @update:modelValue="onInput" />
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {
	validator?: (v: number) => number | null
}

const props = defineProps<Props>()

const sketch = useSketchStore()

const literalValue = computed(() => {
	const expr = toRaw(props.value)
	if (typeof expr === 'number') {
		return expr
	}

	const evaluated = getEvaluated(expr)
	if (typeof evaluated === 'number') {
		return evaluated
	}

	throw new Error('Nota number but got=' + evaluated)
})

function onInput(newExpr: number) {
	sketch.replace(props.parent, props.value, newExpr)
	// Parse if necessary
	// if (typeof value === 'string') {
	// 	let ret
	// 	try {
	// 		ret = parse(value)
	// 	} catch (e) {
	// 		return
	// 	}
	// 	newExp = ret
	// }
	// // Validate
	// if (props.validator && typeof value === 'number') {
	// 	let validated
	// 	if (display.value.mode === 'unit') {
	// 		const unitValue = (fn.value as any)(value as any)
	// 		validated = (display.value.inverseFn as any)({
	// 			['return']: props.validator(unitValue),
	// 		})[0]
	// 	} else {
	// 		validated = props.validator(value)
	// 	}
	// 	if (typeof validated === 'number') {
	// 		newExp = validated
	// 	}
	// }
	// // Reverse evaluation
	// if (display.value.mode === 'unit') {
	// 	const unitValue =
	// 		typeof newExp === 'number'
	// 			? reverseEval(newExp, (props.expr as Expr[])[1])
	// 			: newExp
	// 	newExp = L((props.expr as Expr[])[0], unitValue)
	// } else if (display.value.mode === 'exp') {
	// 	newExp =
	// 		typeof newExp === 'number' ? reverseEval(newExp, props.expr) : newExp
	// }
}
</script>
