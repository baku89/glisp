<template>
	<table class="ParamControl">
		<tr
			v-for="(schema, i) in uiSchema"
			:key="i"
			class="ParamControl__param"
			:class="{'is-default': schema.isDefault}"
		>
			<td class="ParamControl__label">{{ schema.label }}</td>
			<td class="ParamControl__value">
				<div class="ParamControl__input">
					<component
						:is="'ui-' + schema.ui"
						v-bind="schema"
						@input="onParamInput(i, $event)"
						@select="$emit('select', $event)"
						@end-tweak="$emit('end-tweak')"
					/>
				</div>
				<template v-if="isVectorVariadic && i >= vectorVariadicPos">
					<button class="ParamControl__button delete" @click="onParamDelete(i)">
						<i class="far fa-times-circle" />
					</button>
					<button class="ParamControl__button insert" @click="onParamInsert(i)">Insert</button>
				</template>
			</td>
		</tr>
		<tr v-if="isVectorVariadic">
			<td class="ParamControl__label"></td>
			<td class="ParamControl__value">
				<button class="ParamControl__button add" @click="onParamInsert(uiSchema.length)">+ Add</button>
			</td>
		</tr>
	</table>
</template>

<script lang="ts">
import {defineComponent, computed, SetupContext} from '@vue/composition-api'
import {
	MalSeq,
	MalVal,
	MalFunc,
	createList as L,
	isVector,
	keywordFor as K,
	isMap,
} from '@/mal/types'
import * as MalInputComponents from '@/components/mal-inputs'
import {getFnInfo, getMapValue} from '@/mal/utils'
import {nonReactive, NonReactive} from '@/utils'
import {
	generateSchemaParamLabel,
	generateUISchemaParams,
	updateParamsByUISchema,
	SchemaVector,
} from '../mal/schema'
import {convertMalNodeToJSObject} from '@/mal/reader'

interface Props {
	exp: NonReactive<MalSeq>
	fn: MalFunc
}

const TypeDefaults = {
	number: 0,
	vec2: [0, 0],
	path: [K('path')],
} as {[type: string]: MalVal}

export default defineComponent({
	name: 'ParamControl',
	props: {
		exp: {required: true},
		fn: {required: false},
	},
	components: {
		'ui-number': MalInputComponents.MalInputNumber,
		// 'ui-slider': MalInputComponents.MalInputSlider,
		'ui-angle': MalInputComponents.MalInputAngle,
		'ui-seed': MalInputComponents.MalInputSeed,
		'ui-string': MalInputComponents.MalInputString,
		'ui-color': MalInputComponents.MalInputColor,
		'ui-dropdown': MalInputComponents.MalInputDropdown,
		'ui-keyword': MalInputComponents.MalInputKeyword,
		'ui-symbol': MalInputComponents.MalInputSymbol,
		// 'ui-boolean': MalInputComponents.MalInputBoolean,
		'ui-vec2': MalInputComponents.MalInputVec2,
		'ui-rect2d': MalInputComponents.MalInputRect2d,
		'ui-mat2d': MalInputComponents.MalInputMat2d,
		// 'ui-path': MalInputComponents.MalInputPath,
		'ui-exp': MalInputComponents.MalExpButton,
		// 'ui-any': MalInputComponents.MalInputAny,
	},
	setup(props: Props, context: SetupContext) {
		const fnInfo = computed(() => {
			const ret = getFnInfo(props.fn || props.exp.value)
			if (!ret) {
				throw new Error('Cannot retrieve function reference')
			}
			return ret
		})

		const params = computed(() => {
			if (fnInfo.value.structType) {
				return [props.exp.value]
			} else {
				return props.exp.value.slice(1)
			}
		})

		const schema = computed(() => {
			const meta = fnInfo.value.meta
			const malSchema = getMapValue(meta, 'params')

			// Convert to JS Object
			const schema = convertMalNodeToJSObject(malSchema)

			// Add label
			const labeledSchema = generateSchemaParamLabel(
				schema as any,
				fnInfo.value.fn as any
			)

			return labeledSchema
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
			const ret = generateUISchemaParams(schema.value, params.value)
			return ret
		})

		// Updator
		function onParamInput(i: number, value: NonReactive<MalVal>) {
			const newParams = updateParamsByUISchema(
				schema.value,
				uiSchema.value,
				params.value,
				i,
				value.value
			)

			const newExp = fnInfo.value.structType
				? newParams[0]
				: L(props.exp.value[0], ...newParams)

			context.emit('input', nonReactive(newExp))
		}

		function onParamInsert(i: number) {
			const newParams = [...params.value]
			const vectorSchema = schema.value[schema.value.length - 1] as SchemaVector
			const variadicSchema = vectorSchema.items

			const type = variadicSchema.type

			// Compute value
			let value = TypeDefaults[type]

			if (vectorSchema.insert) {
				value = (vectorSchema.insert as any)({
					[K('params')]: params.value.slice(vectorVariadicPos.value),
					[K('index')]: i - vectorVariadicPos.value,
				})
			} else if ('default' in variadicSchema) {
				value = variadicSchema.default as MalVal
			}

			newParams.splice(i, 0, value)
			const newValue = L(props.exp.value[0], ...newParams)
			context.emit('input', nonReactive(newValue))
		}

		function onParamDelete(i: number) {
			const newParams = [...params.value]
			newParams.splice(i, 1)

			const newValue = L(props.exp.value[0], ...newParams)
			context.emit('input', nonReactive(newValue))
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
		height $param-height

		&.is-default
			opacity 0.5

		& > td
			padding 0.1em 0

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
			margin-top 0.3em
			padding 0.1em 0.5em
			height auto
			border 1px solid var(--comment)
			border-radius 3px
			color var(--comment)
			font-size 0.9em

			&:hover
				border-color var(--hover)
				color var(--hover)
</style>
