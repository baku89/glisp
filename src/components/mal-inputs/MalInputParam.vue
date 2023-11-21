<template>
	<div class="MalInputParam">
		<div v-for="(scheme, i) in schemes" :key="i" class="MalInputParam__param">
			<div v-if="scheme.label" class="MalInputParam__label">
				{{ scheme.label }}
			</div>
			<component
				:is="scheme.type"
				class="MalInputParam__input"
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

import {convertMalNodeToJSObject} from '@/mal/reader'
import {
	cloneExp,
	getEvaluated,
	getMeta,
	MalSeq,
	MalType,
	MalVal,
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'

interface Props {
	value: MalSeq
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	'end-tweak': []
}>()

const params = computed(() => {
	return props.value.slice(1)
})

const fn = computed(() => getEvaluated(props.value[0]))

const schemes = computed(
	() =>
		convertMalNodeToJSObject(
			getMapValue(getMeta(fn.value), 'compact-params', MalType.Vector)
		) || null
)

function updateParamAt(value: MalVal, i: number) {
	const newExp = cloneExp(props.value)
	newExp[i + 1] = value

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputParam
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
