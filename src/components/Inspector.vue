<script lang="ts" setup>
import {computed} from 'vue'
import VueMarkdown from 'vue-markdown'

import Inspectors from '@/components/inspectors'
import {
	getOuter,
	isList,
	isSymbol,
	MalNode,
	MalSymbol,
	MalType,
	MalVal,
} from '@/mal/types'
import {copyDelimiters, getFnInfo, getMapValue} from '@/mal/utils'

const props = defineProps<{
	exp: MalNode
}>()

const emit = defineEmits<{
	input: [newExp: MalVal]
	select: [exp: MalNode]
	'end-tweak': []
}>()

const fnInfo = computed(() => {
	return getFnInfo(props.exp)
})

const fnName = computed(() => {
	if (fnInfo.value?.structType) {
		return fnInfo.value.structType
	} else if (
		fnInfo.value?.fn ||
		(isList(props.exp) && isSymbol(props.exp[0]))
	) {
		return ((props.exp as MalVal[])[0] as MalSymbol).value || ''
	} else {
		return ''
	}
})

const fnDoc = computed(() => {
	if (fnInfo.value?.meta) {
		return getMapValue(fnInfo.value.meta, 'doc', MalType.String, '') as string
	}
	return ''
})

const outer = computed(() => {
	const outer = getOuter(props.exp)

	if (getOuter(outer)) {
		return outer
	}
	return null
})

const inspectorName = computed(() => {
	const customInspector = `Inspector-${fnName.value}`
	return customInspector in Inspectors ? customInspector : 'ParamControl'
})

function onSelectOuter() {
	if (!outer.value) return
	emit('select', outer.value)
}

function onInput(newExp: MalVal) {
	copyDelimiters(newExp, props.exp)
	emit('input', newExp)
}
</script>

<template>
	<div class="Inspector">
		<div class="Inspector__header">
			<div class="Inspector__name">
				{{ fnName }}
				<span v-if="fnInfo && fnInfo.aliasFor" class="alias">
					<span class="fira-code">--></span>
					alias for
					{{ fnInfo.aliasFor }}
				</span>
				<button v-if="outer" class="Inspector__outer" @click="onSelectOuter">
					<i class="fas fa-level-up-alt" />
				</button>
			</div>
			<VueMarkdown
				class="Inspector__doc"
				:source="fnDoc"
				:anchorAttributes="{target: '_blank'}"
			/>
		</div>
		<component
			:is="inspectorName"
			:exp="exp"
			@input="onInput"
			@select="$emit('select', $event)"
			@end-tweak="$emit('end-tweak')"
		/>
	</div>
</template>

<style lang="stylus">
@import 'style/common.styl'

.Inspector
	position relative
	padding 1rem 0.5rem 1rem 1rem
	height 100%
	text-align left
	user-select none

	.fira-code
		font-monospace()

	&__header
		position relative
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

		.alias
			color var(--comment)
			font-weight normal
			font-size 0.95em

	&__outer
		position absolute
		top 0
		right 0
		color var(--comment)
		opacity 0.6

		&:hover
			color var(--hover)
			opacity 1

	&__doc
		line-height 1.4

		code
			color var(--syntax-function)
</style>
