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
							:is="'ui-' + sch.ui"
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
			<tr v-if="isVectorVariadic">
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
			</tr>
		</template>
	</table>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import {
	MalSeq,
	MalVal,
	MalFunc,
	createList as L,
	keywordFor as K,
	symbolFor,
	cloneExp,
	keywordFor,
	isNode,
} from '@/mal/types'
import * as MalInputComponents from '@/components/mal-inputs'
import {getFnInfo, getMapValue} from '@/mal/utils'
import {
	generateSchemaParamLabel,
	generateUISchema,
	updateParamsByUISchema,
	SchemaVector,
	Schema,
} from '@/mal/schema'
import {convertMalNodeToJSObject, reconstructTree} from '@/mal/reader'

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
} as {[type: string]: MalVal}

export default defineComponent({
	name: 'ParamControl',
	props: {
		exp: {type: Object as PropType<MalSeq>, required: true},
		fn: {type: Function as PropType<MalFunc>, required: false},
	},
	components: {
		'ui-number': MalInputComponents.MalInputNumber,
		'ui-slider': MalInputComponents.MalInputSlider,
		'ui-angle': MalInputComponents.MalInputAngle,
		'ui-seed': MalInputComponents.MalInputSeed,
		'ui-string': MalInputComponents.MalInputString,
		'ui-color': MalInputComponents.MalInputColor,
		'ui-dropdown': MalInputComponents.MalInputDropdown,
		'ui-keyword': MalInputComponents.MalInputKeyword,
		'ui-symbol': MalInputComponents.MalInputSymbol,
		'ui-boolean': MalInputComponents.MalInputBoolean,
		'ui-vec2': MalInputComponents.MalInputVec2,
		'ui-rect2d': MalInputComponents.MalInputRect2d,
		'ui-mat2d': MalInputComponents.MalInputMat2d,
		'ui-size2d': MalInputComponents.MalInputSize2d,
		'ui-path': MalInputComponents.MalExpButton,
		'ui-exp': MalInputComponents.MalExpButton,
		// 'ui-any': MalInputComponents.MalInputAny,
	},
	setup(props, context) {
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

		const schema = computed(() => {
			if (!fnInfo.value) return [] as Schema[]

			const meta = fnInfo.value.meta
			const malSchema = getMapValue(meta, 'params')

			if (!isNode(malSchema)) {
				return undefined
			}

			// Convert to JS Object
			let schema = convertMalNodeToJSObject(malSchema)

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
				return undefined
			}
			try {
				return generateUISchema(schema.value, params.value)
			} catch (e) {
				console.error(e)
				return undefined
			}
		})

		// Updator
		function onParamInput(i: number, value: MalVal) {
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

			reconstructTree(newExp)

			context.emit('input', newExp)
		}

		function onParamInsert(i: number) {
			const newParams = [...params.value]
			const vectorSchema = schema.value[schema.value.length - 1] as SchemaVector
			const variadicSchema = vectorSchema.items

			const type = variadicSchema.type

			// Compute value
			let value = cloneExp(TypeDefaults[type])

			if (vectorSchema.insert) {
				value = (vectorSchema.insert as any)({
					[K('params')]: params.value.slice(vectorVariadicPos.value),
					[K('index')]: i - vectorVariadicPos.value,
				})
			} else if ('default' in variadicSchema) {
				value = variadicSchema.default as MalVal
			}

			newParams.splice(i, 0, value)
			const newExp = L(props.exp[0], ...newParams)

			reconstructTree(newExp)

			context.emit('input', newExp)
		}

		function onParamDelete(i: number) {
			const newParams = [...params.value]
			newParams.splice(i, 1)

			const newExp = L(props.exp[0], ...newParams)
			reconstructTree(newExp)

			context.emit('input', newExp)
		}

		return {
			isVectorVariadic,
			vectorVariadicPos,
			uiSchema,
			onParamInput,
			onParamInsert,
			onParamDelete,
		}
	},
})
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
				color var(--warning)

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
