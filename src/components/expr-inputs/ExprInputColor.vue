<template>
	<div class="ExprInputColor">
		<Tq.InputColor
			class="picker"
			:modelValue="evaluatedValue"
			@update:modelValue="onInput"
		/>
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {
	compact?: boolean
}

const props = defineProps<Props>()
const sketch = useSketchStore()

const literalValue = computed(() => {
	const expr = toRaw(props.value)

	if (typeof expr === 'string') {
		return expr
	}

	return null
})

const evaluatedValue = computed(() => {
	if (literalValue.value) {
		return literalValue.value
	}

	const expr = toRaw(props.value)

	if (typeof expr === 'string') {
		return expr
	}

	throw new Error('Not a string but got=' + expr)
})

function onInput(newExpr: string) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputColor
	display flex
	line-height $input-height

	&__picker
		margin-right 0.5rem

	&__hex
		margin-left 0.3rem
		color var(--comment)
		font-monospace()

	&__mode
		margin-right $input-horiz-margin
		width 3.7em
		border-bottom-color transparent
		color var(--comment)
		font-monospace()

	&__text
		width 6rem
		font-monospace()

	&__elements
		display flex

	&__el
		margin-right 0.2em
		width 3.3em

		&:last-child
			margin-right 0.3em

	&__exp
		margin-left 0.3rem
</style>
@/glis[/types@/glis[/utils
