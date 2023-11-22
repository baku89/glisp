<template>
	<div class="ViewExprTree">
		<div
			class="item"
			:class="{
				active,
				selected,
				hovering,
			}"
		>
			<Icon
				class="chevron"
				:icon="children ? 'mdi:chevron-right' : 'mdi:circle-small'"
				:class="{expanded}"
				@click="expanded = !expanded"
			/>
			<div
				class="item-wrapper"
				@pointerover="onHover"
				@pointerleave="onLeave"
				@click="onClick"
			>
				<Icon v-if="icon" class="icon" :icon="icon" />
				<div class="label">{{ label }}</div>
			</div>
		</div>
		<div v-if="children && expanded" class="children">
			<ViewExprTree
				v-for="(child, i) in children"
				:key="i"
				:expr="child"
				@update:exp="onUpdateChild(i, $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {Icon} from '@iconify/vue'
import {computed, ref, toRaw} from 'vue'

import {ExprColl, getStructType, getType, isColl, printExpr} from '@/glisp'
import {cloneExpr, Expr, ExprSeq, isList, isMap, isVector} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

interface Props {
	expr: Expr
	mode?: 'node' | 'element'
}

const props = withDefaults(defineProps<Props>(), {mode: 'node'})

const emit = defineEmits<{
	'update:expr': [expr: Expr]
}>()

const label = computed(() => {
	const structType = getStructType(props.expr)

	switch (structType) {
		case 'mat2d':
			return 'Transform'
		case 'path':
			return 'Path'
		case 'rect2d':
			return 'Bounds'
		case 'vec2':
			return 'Point'
	}

	if (isList(props.expr)) {
		return props.expr[0] ? printExpr(props.expr[0]) : '()'
	} else if (isVector(props.expr)) {
		return 'Vector'
	} else if (isMap(props.expr)) {
		return 'Map'
	} else {
		return printExpr(props.expr)
	}
})

const icon = computed(() => {
	const type = getType(props.expr)

	const structType = getStructType(props.expr)

	switch (structType || type) {
		case 'path':
			return 'material-symbols:shape-line'
		case 'mat2d':
			return 'material-symbols:transform'
		case 'vec2':
			return 'fa6-solid:location-crosshairs'
		case 'rect2d':
			return 'ph:bounding-box-fill'
		case 'fn':
			return 'mdi:function'
		case 'boolean':
			return 'mdi:toggle-switch'
		case 'keyword':
			return 'mdi:key'
		case 'map':
			return 'mdi:code-braces'
		case 'list':
			return 'mdi:code-parentheses'
		case 'vector':
			return 'mdi:code-brackets'
		case 'macro':
			return 'mdi:shovel'
		case 'nil':
			return 'mdi:circle-off-outline'
		case 'string':
			return 'mdi:format-quote-close'
		case 'symbol':
			return 'mdi:alphabetical'
		case 'atom':
			return 'mdi:atom'
		case 'undefined':
			return 'mdi:help'
	}

	return null
})

const children = computed(() => {
	if (isList(props.expr)) {
		return props.expr.slice(1)
	} else if (isVector(props.expr)) {
		return props.expr
	} else {
		return null
	}
})

const sketch = useSketchStore()

const active = computed(() => {
	return toRaw(props.expr) === toRaw(sketch.activeExpr)
})

const selected = computed(() => {
	return sketch.selectedExprs.includes(props.expr as ExprColl)
})

const hovering = computed(() => {
	return toRaw(props.expr) === toRaw(sketch.hoveringExpr)
})

const expanded = ref(true)

function onHover() {
	if (isColl(props.expr)) {
		sketch.hoveringExpr = props.expr
	}
}

function onLeave() {
	if (sketch.hoveringExpr === props.expr) {
		sketch.hoveringExpr = null
	}
}
function onClick() {
	if (isColl(props.expr)) {
		sketch.activeExpr = props.expr
	}
}

function onUpdateChild(i: number, replaced: Expr) {
	const newExpBody = cloneExpr(props.expr) as ExprSeq
	newExpBody[i + 1] = replaced
	emit('update:expr', newExpBody)
}
</script>

<style lang="stylus" scoped>

.ViewExprTree

display flex
	flex-direction column
	display flex
	gap 3px

.item
	height var(--tq-input-height)
	line-height var(--tq-input-height)
	display flex
	align-items center

.item-wrapper
	padding-left 2px
	flex-grow 1
	display flex
	align-items center
	border-radius var(--tq-input-border-radius)

	.active &
		background var(--tq-color-tinted-input-active)
		color var(--tq-color-primary)

	.hovering &
		box-shadow 0 0 0 1px inset var(--tq-color-primary)

.chevron, .icon
	flex-shrink 0

.chevron
	color var(--tq-color-gray-on-background)
	margin 0 -2px 0 -2px
	transition transform var(--tq-hover-transition-duration) ease
	opacity .5

	&:hover
		color var(--tq-color-primary)
		opacity 1


	&.expanded
		transform rotate(90deg)

.icon
	color var(--tq-color-gray-on-background)

	.active &,
	.hovering &
		color var(--tq-color-primary)

.label
	flex-grow 1
	padding-left 0.5rem
	text-overflow ellipsis
	white-space nowrap

.children
	position relative
	display flex
	flex-direction column
	padding-left calc(var(--tq-input-height) / 2)

	&:before
		position absolute
		top 0
		left calc(var(--tq-input-height) * .35)
		width 0
		height 100%
		border-left 1px solid var(--tq-color-surface-border)
		content ''
</style>
