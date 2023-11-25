<template>
	<Tq.ParameterGrid v-if="uiSchema" class="ParamControl">
		<Tq.Parameter
			v-for="(sch, i) in uiSchema"
			:key="i"
			:class="{'is-default': sch.isDefault, 'is-invalid': sch.isInvalid}"
			:label="sch.label"
		>
			<div class="input-wrapper">
				<div class="input">
					<component
						:is="inputComponents[sch.ui]"
						v-bind="sch"
						:parent="expr"
					/>
				</div>
				<template v-if="variadicPos <= i">
					<Icon icon="typcn:delete" class="delete" @click="deleteParam(i)" />
					<button class="insert" tabindex="-1" @click="insertParam(i)">
						<Icon icon="mdi:plus-thick" class="icon" />
					</button>
				</template>
			</div>
		</Tq.Parameter>
	</Tq.ParameterGrid>
</template>

<script lang="ts" setup>
import {Icon} from '@iconify/vue'
import Tq from 'tweeq'
import {computed, toRaw} from 'vue'

import * as ExprInputComponents from '@/components/expr-inputs'
import {
	clone,
	createList as L,
	Expr,
	ExprList,
	generateSchemaParamLabel,
	generateUISchema,
	getFnInfo,
	getMapValue,
	getParent,
	isColl,
	Schema,
	SchemaVector,
	symbolFor,
} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

interface Props {
	expr: ExprList
}

const props = defineProps<Props>()

const inputComponents: Record<string, any> = {
	number: ExprInputComponents.ExprInputNumber,
	slider: ExprInputComponents.ExprInputSlider,
	angle: ExprInputComponents.ExprInputAngle,
	seed: ExprInputComponents.ExprInputSeed,
	string: ExprInputComponents.ExprInputString,
	color: ExprInputComponents.ExprInputColor,
	dropdown: ExprInputComponents.ExprInputDropdown,
	symbol: ExprInputComponents.ExprInputSymbol,
	boolean: ExprInputComponents.ExprInputBoolean,
	vec2: ExprInputComponents.ExprInputVec2,
	rect2d: ExprInputComponents.ExprInputRect2d,
	mat2d: ExprInputComponents.ExprInputMat2d,
	size2d: ExprInputComponents.ExprInputSize2d,
	path: ExprInputComponents.ExprSelectButton,
	exp: ExprInputComponents.ExprSelectButton,
}

const TypeDefaults = {
	number: 0,
	string: '',
	symbol: symbolFor('_'),
	boolean: false,
	vec2: [0, 0],
	rect2d: [0, 0, 1, 1],
	mat2d: [1, 0, 0, 1, 0, 0],
	size2d: L(symbolFor('vec2/size'), 1, 1, false),
	path: ['path'],
	exp: null,
	any: null,
} as {[type: string]: Expr}

const fnInfo = computed(() => {
	return getFnInfo(toRaw(props.expr))
})

const params = computed(() => {
	if (!fnInfo.value) return []

	if (fnInfo.value.structType) {
		return [props.expr]
	} else {
		return props.expr.slice(1)
	}
})

const schema = computed<Schema[]>(() => {
	if (!fnInfo.value) return []

	const meta = fnInfo.value.meta
	let schema = getMapValue(meta, 'params')

	if (!isColl(schema)) {
		return null
	}
	// Add label
	if (Array.isArray(schema)) {
		schema = generateSchemaParamLabel(
			schema as any,
			fnInfo.value.fn as any
		) as any
	}
	return schema
})

const variadicPos = computed(() => {
	if (schema.value.length > 0) {
		const lastSchema = schema.value.at(-1)
		if (lastSchema?.variadic && lastSchema.type === 'vector') {
			return schema.value.length - 1
		}
	}

	return Infinity
})

// UISchema
const uiSchema = computed(() => {
	if (!schema.value) {
		return null
	}
	return generateUISchema(schema.value, params.value)
})

function insertParam(i: number) {
	const expr = toRaw(props.expr)
	const parent = getParent(expr)

	if (!parent) {
		throw new Error('No parent')
	}

	const newParams = [...params.value]
	const vectorSchema = schema.value[schema.value.length - 1] as SchemaVector
	const variadicSchema = vectorSchema.items

	const type = variadicSchema.type

	// Compute value
	let value = clone(TypeDefaults[type])

	if (vectorSchema.insert) {
		value = (vectorSchema.insert as any)({
			['params']: params.value.slice(variadicPos.value),
			['index']: i - variadicPos.value,
		})
	} else if ('default' in variadicSchema) {
		value = variadicSchema.default as Expr
	}

	newParams.splice(i, 0, value)
	const newExpr = L(expr[0], ...newParams)

	sketch.replace(parent, expr, newExpr)
}

const sketch = useSketchStore()

function deleteParam(i: number) {
	const parent = getParent(toRaw(props.expr))

	if (!parent) {
		throw new Error('No parent')
	}

	const newParams = [...params.value]
	newParams.splice(i, 1)

	const newExpr = L(props.expr[0], ...newParams)

	sketch.replace(parent, props.expr, newExpr)
}
</script>

<style lang="stylus" scoped>
@import './style/common.styl'

.input-wrapper
	position relative
	display flex
	align-items center
	gap var(--tq-input-gap)

.input
	flex-grow 1

.delete
	color var(--tq-color-gray-on-background)
	cursor poiner

	&:hover
		color var(--tq-color-error)

.insert
	position absolute
	height var(--tq-input-gap)
	width 100%
	top calc(-1 * var(--tq-input-gap))
	color var(--tq-color-affirmative)
	opacity 0
	border-radius 99px

	&:before
		content ''
		position absolute
		left 0
		right calc(var(--tq-input-height) - 8px + var(--tq-input-gap))
		height 1px
		background var(--tq-color-affirmative)
		top 50%
		margin-top -0.5px

	&:hover
		z-index 10
		opacity 1

	.icon
		position absolute
		right 2px
		top 50%
		width calc(var(--tq-input-height) - 8px)
		height calc(var(--tq-input-height) - 8px)
		transform translateY(-50%)
</style>
