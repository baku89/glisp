<script lang="ts" setup>
import {Icon} from '@iconify/vue'
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import {
	Expr,
	ExprColl,
	getFnInfo,
	getMapValue,
	getParent,
	isList,
	isSymbol,
} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

import ParamControl from './ParamControl.vue'

const sketch = useSketchStore()

const emit = defineEmits<{
	input: [newExp: Expr]
	'update:expr': [newExp: Expr]
	'end-tweak': []
}>()

const fnInfo = computed(() => {
	return getFnInfo(toRaw(sketch.activeExpr as ExprColl))
})

const name = computed(() => {
	if (!fnInfo.value) {
		return ''
	}

	if (fnInfo.value.structType) {
		return fnInfo.value.structType
	}

	const activeExpr = toRaw(sketch.activeExpr as ExprColl)

	if (isList(activeExpr) && isSymbol(activeExpr[0])) {
		return activeExpr[0].value
	}

	return ''
})

const fnDoc = computed(() => {
	if (fnInfo.value?.meta) {
		return getMapValue(fnInfo.value.meta, 'doc', 'string', '') as string
	}
	return ''
})

const parent = computed(() => {
	const activeExpr = toRaw(sketch.activeExpr as ExprColl)
	const parent = toRaw(getParent(activeExpr))

	if (parent !== toRaw(sketch.expr)) {
		return parent
	} else {
		return null
	}
})

function onSelectParent() {
	if (!parent.value) return

	emit('update:expr', parent.value)
}
</script>

<template>
	<div v-if="sketch.activeExpr" class="Inspector">
		<div class="header">
			<div class="name">
				{{ name }}
			</div>
			<span v-if="fnInfo && fnInfo.aliasFor" class="alias">
				<span class="fira-code">--></span>
				alias for
				{{ fnInfo.aliasFor }}
			</span>
			<span class="spacer" />
			<Icon
				v-if="parent"
				icon="mdi:arrow-up"
				class="parent"
				@click="onSelectParent"
			/>
		</div>
		<Tq.Markdown class="doc" :source="fnDoc" />
		<ParamControl :expr="sketch.activeExpr" />
	</div>
</template>

<style lang="stylus">
@import 'style/common.styl'

.Inspector
	position relative
	padding var(--tq-pane-padding)
	height 100%
	text-align left
	user-select none
	display flex
	flex-direction column
	gap 1em

.header
	position relative
	display flex
	align-items center
	gap 1px

.name
	font-weight bold
	font-size 1.2em
	font-family var(--tq-font-heading)

.alias
	color var(--comment)
	font-weight normal
	font-size 0.95em

.spacer
	flex-grow 1

.parent
	color var(--tq-color-gray-on-background)
	border-radius var(--tq-input-border-radius)

	&:hover
		color var(--tq-color-primary)
		opacity 1
		background var(--tq-color-tinted-input)

.doc
	line-height 1.4

	code
		color var(--syntax-function)
</style>
@/glis[/types@/glis[/utils
