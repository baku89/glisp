<template>
	<div class="ExprInputSeed">
		<ExprInputNumber :value="value" />
		<Tq.InputSeed class="ExprInputSeed__shuffle" @input="onInput" />
	</div>
</template>

<script lang="ts" setup>
import Tq from 'tweeq'

import {Expr} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import {PropBase} from './types'

interface Props extends PropBase {}

const props = defineProps<Props>()

const sketch = useSketchStore()

function onInput(newExpr: Expr) {
	sketch.replace(props.parent, props.value, newExpr)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputSeed
	display flex
	align-items center
	line-height $input-height

	&__input
		margin-right $input-horiz-margin
</style>
@/glis[/types@/glis[/utils
