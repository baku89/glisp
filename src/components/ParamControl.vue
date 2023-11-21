<template>
	<table class="ParamControl">
		<template v-if="uiSchema">
			<tr
				v-for="(sch, i) in uiSchema"
				:key="i"
				class="ParamControl__param"
				:class="{'is-default': sch.isDefault, 'is-invalid': sch.isInvalid}"
			>
				<td class="ParamControl__label">{{ sch.label }}</td>
				<td class="ParamControl__value">
					<div class="ParamControl__input">
						<component
							:is="inputComponents[sch.ui]"
							v-bind="sch"
							@input="onParamInput(i, $event)"
							@select="$emit('select', $event)"
							@end-tweak="$emit('end-tweak')"
						/>
					</div>
					<template v-if="isVectorVariadic && i >= vectorVariadicPos">
						<button
							class="ParamControl__button delete far fa-times-circle"
							tabindex="-1"
							@click="onParamDelete(i)"
						></button>
						<button
							class="ParamControl__button insert"
							tabindex="-1"
							@click="onParamInsert(i)"
						>
							Insert
						</button>
					</template>
				</td>
			</tr>
			<!-- <tr v-if="isVectorVariadic">
				<td class="ParamControl__label"></td>
				<td class="ParamControl__value">
					<button
						class="ParamControl__button add"
						tabindex="-1"
						@click="onParamInsert(uiSchema.length)"
					>
						+ Add
					</button>
				</td>
			</tr> -->
		</template>
	</table>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import * as ExprInputComponents from '@/components/expr-inputs'
import {
	cloneExpr,
	convertExprCollToJSObject,
	createList as L,
	Expr,
	ExprFn,
	ExprSeq,
	generateSchemaParamLabel,
	generateUISchema,
	getFnInfo,
	getMapValue,
	isColl,
	keywordFor as K,
	keywordFor,
	markParent,
	Schema,
	SchemaVector,
	symbolFor,
	updateParamsByUISchema,
} from '@/glisp'

interface Props {
	exp: ExprSeq
	fn?: ExprFn
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [exp: Expr]
	select: [exp: Expr]
	'end-tweak': []
}>()

const inputComponents: Record<string, any> = {
	number: ExprInputComponents.ExprInputNumber,
	slider: ExprInputComponents.ExprInputSlider,
	angle: ExprInputComponents.ExprInputAngle,
	seed: ExprInputComponents.ExprInputSeed,
	string: ExprInputComponents.ExprInputString,
	color: ExprInputComponents.ExprInputColor,
	dropdown: ExprInputComponents.ExprInputDropdown,
	keyword: ExprInputComponents.ExprInputKeyword,
	symbol: ExprInputComponents.ExprInputSymbol,
	boolean: ExprInputComponents.ExprInputBoolean,
	vec2: ExprInputComponents.ExprInputVec2,
	rect2d: ExprInputComponents.ExprInputRect2d,
	mat2d: ExprInputComponents.ExprInputMat2d,
	size2d: ExprInputComponents.ExprInputSize2d,
	path: ExprInputComponents.ExprSelectButton,
	exp: ExprInputComponents.ExprSelectButton,
	// 'ui-any': ExprInputComponents.ExprInputAny,
}

const TypeDefaults = {
	number: 0,
	string: '',
	symbol: symbolFor('_'),
	keyword: keywordFor('_'),
	boolean: false,
	vec2: [0, 0],
	rect2d: [0, 0, 1, 1],
	mat2d: [1, 0, 0, 1, 0, 0],
	size2d: L(symbolFor('vec2/size'), 1, 1, false),
	path: [K('path')],
	exp: null,
	any: null,
} as {[type: string]: Expr}

const fnInfo = computed(() => {
	return getFnInfo(props.fn || props.exp)
})

const params = computed(() => {
	if (!fnInfo.value) return []

	if (fnInfo.value.structType) {
		return [props.exp]
	} else {
		return props.exp.slice(1)
	}
})

const schema = computed<Schema[]>(() => {
	if (!fnInfo.value) return []

	const meta = fnInfo.value.meta
	const malSchema = getMapValue(meta, 'params')

	if (!isColl(malSchema)) {
		return null
	}

	// Convert to JS Object
	let schema = convertExprCollToJSObject(malSchema)

	// Add label
	if (Array.isArray(schema)) {
		schema = generateSchemaParamLabel(schema as any, fnInfo.value.fn as any)
	}
	return schema
})

// Vector variadic
const isVectorVariadic = computed(() => {
	if (schema.value.length > 0) {
		const lastSchema = schema.value[schema.value.length - 1]
		return !!lastSchema.variadic && lastSchema.type === 'vector'
	} else {
		return false
	}
})

const vectorVariadicPos = computed(() => {
	if (isVectorVariadic.value) {
		return schema.value.length - 1
	} else {
		return -1
	}
})

// UISchema
const uiSchema = computed(() => {
	if (!schema.value) {
		return null
	}
	return generateUISchema(schema.value, params.value)
})

// Updator
function onParamInput(i: number, value: Expr) {
	if (!fnInfo.value) return

	const newParams = updateParamsByUISchema(
		schema.value,
		uiSchema.value as Schema[],
		params.value,
		i,
		value
	)

	const newExp = fnInfo.value.structType
		? newParams[0]
		: L(props.exp[0], ...newParams)

	markParent(newExp)

	emit('input', newExp)
}

function onParamInsert(i: number) {
	const newParams = [...params.value]
	const vectorSchema = schema.value[schema.value.length - 1] as SchemaVector
	const variadicSchema = vectorSchema.items

	const type = variadicSchema.type

	// Compute value
	let value = cloneExpr(TypeDefaults[type])

	if (vectorSchema.insert) {
		value = (vectorSchema.insert as any)({
			[K('params')]: params.value.slice(vectorVariadicPos.value),
			[K('index')]: i - vectorVariadicPos.value,
		})
	} else if ('default' in variadicSchema) {
		value = variadicSchema.default as Expr
	}

	newParams.splice(i, 0, value)
	const newExp = L(props.exp[0], ...newParams)

	markParent(newExp)

	emit('input', newExp)
}

function onParamDelete(i: number) {
	const newParams = [...params.value]
	newParams.splice(i, 1)

	const newExp = L(props.exp[0], ...newParams)
	markParent(newExp)

	emit('input', newExp)
}
</script>

<style lang="stylus">
@import './style/common.styl'

.ParamControl
	position relative
	width 100%
	table-layout fixed

	&__param
		position relative

		&.is-default
			opacity 0.5

		&.is-invalid .ParamControl__label
			color var(--red)

			&:after
				content ' ⚠'

		& > td
			padding 0.2em 0

	&__label
		clear both
		padding-right 1em
		width 5.5em
		height $param-height
		color var(--comment)
		white-space nowrap
		line-height $param-height

	&__value
		display flex
		align-items center
		width 99%

	&__input
		max-width calc(100% - 2rem)

	&__button
		height 100%
		color var(--comment)
		line-height $param-height
		cursor pointer
		input-transition()

		&:hover
			opacity 1 !important

		&.delete
			position relative
			z-index 10
			opacity 0.5

			&:hover
				color var(--tq-color-error)

		&.insert
			align-self start
			font-weight normal
			opacity 0
			transform translate(-1em, -66%)

			&:before
				content '<-- '
				font-monospace()

			&:hover
				color var(--hover)

			&:after
				position absolute
				top 50%
				right 0
				display block
				width 100%
				width 23em
				height 0.5em
				// background red
				content ''
				transform translateY(-50%)

		&.add
			labeled-button()
</style>
@/glis[/reader@/glis[/schema@/glis[/types@/glis[/utils @/components/expr-inputs
