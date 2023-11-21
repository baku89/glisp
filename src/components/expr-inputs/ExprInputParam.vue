<template>
	<div class="ExprInputParam">
		<div v-for="(scheme, i) in schemes" :key="i" class="ExprInputParam__param">
			<div v-if="scheme.label" class="ExprInputParam__label">
				{{ scheme.label }}
			</div>
			<component
				:is="scheme.type"
				class="ExprInputParam__input"
				:value="params[i]"
				:compact="true"
				@input="updateParamAt($event, i)"
				@end-tweak="$emit('end-tweak')"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {
	cloneExpr,
	convertExprCollToJSObject,
	Expr,
	ExprSeq,
	getEvaluated,
	getMapValue,
	getMeta,
} from '@/glisp'

interface Props {
	value: ExprSeq
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr]
	'end-tweak': []
}>()

const params = computed(() => {
	return props.value.slice(1)
})

const fn = computed(() => getEvaluated(props.value[0]))

const schemes = computed(
	() =>
		convertExprCollToJSObject(
			getMapValue(getMeta(fn.value), 'compact-params', 'vector')
		) || null
)

function updateParamAt(value: Expr, i: number) {
	const newExp = cloneExpr(props.value)
	newExp[i + 1] = value

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprInputParam
	display flex
	align-items center
	line-height $input-height

	&__param
		display flex
		align-items center

	&__label
		margin-right 0.4rem

	&__input
		margin-right 0.6rem
</style>
@/glis[/reader@/glis[/types@/glis[/utils
