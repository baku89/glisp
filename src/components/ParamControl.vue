<template>
	<table class="ParamControl">
		<tr
			v-for="(schema, i) in uiSchema"
			:key="i"
			class="ParamControl__param"
			:class="{'is-default': /*params[i].isDefault*/ false}"
		>
			<td class="ParamControl__label">{{ schema.label }}</td>
			<td class="ParamControl__value">
				<div class="ParamControl__input">
					<component
						:is="schema.ui"
						v-bind="schema"
						@input="onParamInput(i, $event)"
						@select="$emit('select', $event)"
						@end-tweak="$emit('end-tweak')"
					/>
				</div>
				<!-- <button
					class="ParamControl__button delete"
					v-if="i >= variadicPos"
					@click="onParamDelete(i)"
				>
					<i class="far fa-times-circle" />
				</button>
				<button
					class="ParamControl__button insert"
					v-if="i >= variadicPos"
					@click="onParamInsert(i)"
				>
					Insert
				</button> -->
			</td>
		</tr>
		<!-- <tr v-if="paramDescs.rest && paramDescs.rest.type === 'variadic'">
			<td class="ParamControl__label"></td>
			<td class="ParamControl__value">
				<button
					class="ParamControl__button add"
					@click="onParamInsert(params.length)"
				>
					+ Add
				</button>
			</td>
		</tr>-->
	</table>
</template>

<script lang="ts">
import {defineComponent, computed, SetupContext} from '@vue/composition-api'
import {MalSeq, MalVal, MalFunc, createList as L, isVector} from '@/mal/types'
import * as MalInputComponents from '@/components/mal-inputs'
import {getFnInfo, getMapValue} from '@/mal/utils'
import {nonReactive, NonReactive} from '@/utils'
import {generateSchemaParamLabel, generateUISchemaParams} from '../mal/schema'
import {convertMalNodeToJSObject} from '@/mal/reader'

interface Props {
	exp: NonReactive<MalSeq>
	fn: MalFunc
}

// interface Desc {
// 	[keyword: string]: any
// }

// type RestType = null | 'variadic' | 'keyword'

// interface Param {
// 	type: string
// 	value: NonReactive<MalVal[]>
// 	isDefault: boolean
// }

// interface ParamDescs {
// 	descs: Desc[]
// 	rest: null | {
// 		pos: number
// 		type: RestType
// 	}
// }

// const EmptyParamDescs = {
// 	descs: [],
// 	rest: null,
// }

// const TypeDefaults = {
// 	number: 0,
// 	vec2: [0, 0],
// 	path: [K('path')],
// } as {[type: string]: MalVal}

// const InterpolateFuncs = {
// 	number: (a: number, b: number) => (a + b) / 2,
// 	vec2: (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
// } as {[type: string]: (...xs: MalVal[]) => MalVal}

// type MetaDescs = (Desc | string)[]

export default defineComponent({
	name: 'ParamControl',
	props: {
		exp: {required: true},
		fn: {required: false},
	},
	components: {
		number: MalInputComponents.MalInputNumber,
		//slider: MalInputComponents.MalInputSlider,
		angle: MalInputComponents.MalInputAngle,
		seed: MalInputComponents.MalInputSeed,
		string: MalInputComponents.MalInputString,
		color: MalInputComponents.MalInputColor,
		dropdown: MalInputComponents.MalInputDropdown,
		// keyword: MalInputComponents.MalInputKeyword,
		// symbol: MalInputComponents.MalInputSymbol,
		// boolean: MalInputComponents.MalInputBoolean,
		vec2: MalInputComponents.MalInputVec2,
		rect2d: MalInputComponents.MalInputRect2d,
		mat2d: MalInputComponents.MalInputMat2d,
		// path: MalInputComponents.MalInputPath,
		exp: MalInputComponents.MalExpButton,
		//any: MalInputComponents.MalExpButton,
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
			if (!isVector(malSchema)) {
				throw new Error('Invalid shema')
			}

			// Convert to JS Object
			const rawSchema = convertMalNodeToJSObject(malSchema)

			// Add label
			const labeledSchema = generateSchemaParamLabel(
				rawSchema as any,
				fnInfo.value.fn as any
			)

			return labeledSchema
		})

		const uiSchema = computed(() => {
			const ret = generateUISchemaParams(schema.value, params.value)
			return ret
		})

		function onParamInput(i: number, value: NonReactive<MalVal>) {
			const newParams = [...params.value]
			newParams[i] = value.value

			const newExp = fnInfo.value.structType
				? newParams[0]
				: L(props.exp.value[0], ...newParams)

			context.emit('input', nonReactive(newExp))
		}

		return {
			uiSchema,
			onParamInput,
		}

		/*


		// The parameter part of exp


		function detectInputType(v: MalVal) {
			return getStructType(v) || getType(v) || 'any'
		}

		function matchParameter(
			params: Readonly<MalVal[]>,
			metaDesc: MetaDescs,
			forceMatch = false
		): ParamDescs | null {
			const restPos = metaDesc.findIndex(d => malEquals(d, S_AMP))

			if (restPos === -1) {
				if (params.length === metaDesc.length || forceMatch) {
					return {descs: metaDesc as Desc[], rest: null}
				} else {
					return null
				}
			} else {
				const restDesc = metaDesc[restPos + 1] as Desc

				const requiredDescs = metaDesc.slice(0, restPos)

				if (K_KEYS in restDesc) {
					// Keyworded rest args
					const keys = restDesc[K_KEYS] as [string, Desc][]
					const keywordsDescs = keys.map((desc: Desc) => {
						const predefinedDesc = {
							[K_LABEL]: getParamLabel(desc[K_KEY]),
						}
						return {...predefinedDesc, ...desc}
					})
					return {
						descs: [...requiredDescs, ...keywordsDescs] as Desc[],
						rest: {
							pos: restPos,
							type: 'keyword',
						},
					}
				} else {
					// Variadic args
					const restParamCount = params.slice(restPos).length

					const restDescs = Array(restParamCount).fill(restDesc)
					return {
						descs: [...requiredDescs, ...restDescs] as Desc[],
						rest: {
							pos: restPos,
							type: 'variadic',
						},
					}
				}
			}
		}

		const paramDescs = computed(() => {
			if (!fnInfo.value) {
				return EmptyParamDescs
			}

			let paramDescs: ParamDescs | null = null
			const fnMetaParams = isMalFunc(fnInfo.value.fn)
				? fnInfo.value.fn[M_PARAMS]
				: null

			// Check if the function has parmeter info as metadata
			if (fnInfo.value && fnInfo.value.meta && K_PARAMS in fnInfo.value.meta) {
				const metaDescs = fnInfo.value.meta[K_PARAMS] as MetaDescs | MetaDescs[]

				if (!isVector(metaDescs)) {
					throw new MalError('Invalid params scheme')
				}

				if (isVector(metaDescs[0])) {
					// Has overloads then try to match the parameter
					for (const desc of metaDescs) {
						if (
							(paramDescs = matchParameter(fnParams.value, desc as MetaDescs))
						) {
							break
						}
					}
					if (!paramDescs) {
						// If no overloads matched, force apply first overload
						paramDescs = matchParameter(
							fnParams.value,
							metaDescs[0] as MetaDescs,
							true
						)
					}
				} else {
					// Usually try to match parameter
					paramDescs = matchParameter(fnParams.value, metaDescs, true)
				}
			} else if (fnMetaParams) {
				// else use parameter info of MalFunc
				const descs: Desc[] = []

				for (let i = 0; i < fnMetaParams.length; i++) {
					// Variadic parameter
					if (malEquals(fnMetaParams[i], S_AMP)) {
						for (let j = i; j < fnParams.value.length; j++) {
							const type = fnParams.value
								? detectInputType(fnParams.value[j])
								: 'any'
							descs.push({
								[K_TYPE]: type,
								[K_LABEL]: j === i ? getParamLabel(fnMetaParams[i + 1]) : '',
							})
						}
						break
					}

					const type = fnParams.value
						? detectInputType(fnParams.value[i])
						: 'any'
					descs.push({[K_TYPE]: type})
				}

				paramDescs = {
					descs,
					rest: null,
				}
			}

			// Set Neccessary info
			if (paramDescs) {
				const {descs, rest} = paramDescs

				const restPos =
					rest && rest.type === 'variadic' ? rest.pos : descs.length

				paramDescs.descs = paramDescs.descs.map((_desc, i) => {
					const desc = {..._desc}

					// Set label from params if not exists
					if (!(K_LABEL in desc) && fnMetaParams && i <= restPos) {
						const pi = i === restPos ? restPos + 1 : i
						desc[K_LABEL] = fnMetaParams[pi]
							? getParamLabel(fnMetaParams[pi])
							: ''
					}

					// Set the type if it is not specified or set to any
					if (!(K_TYPE in desc)) {
						desc[K_TYPE] = 'any'
					}
					return desc
				})
			}
			return paramDescs || EmptyParamDescs
		})

		const variadicPos = computed(() => {
			if (paramDescs.value.rest?.type === 'variadic') {
				return paramDescs.value.rest.pos
			} else {
				return paramDescs.value.descs.length
			}
		})

		const params = computed(() => {
			const params: Param[] = []

			const {descs, rest} = paramDescs.value

			for (let i = 0; i < descs.length; i++) {
				const desc = descs[i]

				if (rest && rest.type === 'keyword' && rest.pos <= i) {
					const hm = assocBang({}, ...fnParams.value.slice(i))

					for (let j = i; j < descs.length; j++) {
						const desc = descs[j]
						const key = desc[K_KEY]

						const isDefault = !(key in hm) && K_DEFAULT in desc
						const value = nonReactive(isDefault ? desc[K_DEFAULT] : hm[key])
						const type = matchInputTypeOfValueAndDesc(value.value, desc)

						params.push({type, value, isDefault})
					}
					return params
				}

				const isDefault = fnParams.value.length <= i && K_DEFAULT in desc
				const value = nonReactive(
					isDefault ? desc[K_DEFAULT] : fnParams.value[i]
				)
				const type = matchInputTypeOfValueAndDesc(value.value, desc)

				params.push({type, value, isDefault})
			}
			return params
		})

		const PREFERENTIAL_TYPSE = new Set([
			'number',
			'angle',
			'vec2',
			'rect2d',
			'mat2d',
			'color',
			'dropdown',
			'seed',
		])

		function matchInputTypeOfValueAndDesc(value: MalVal, desc: Desc): string {
			const inputType = detectInputType(value)
			const descType = desc[K_TYPE] as string
			if (inputType !== descType) {
				if (descType === 'any') {
					return inputType
				} else if (PREFERENTIAL_TYPSE.has(descType)) {
					return descType
				} else if (descType === 'seed' && inputType === 'number') {
					return 'seed'
				} else if (descType) {
					return 'exp'
				}
			}
			return descType
		}

		function onParamDelete(i: number) {
			if (!fnInfo.value) {
				return
			}

			const newParams = [...fnParams.value]
			newParams.splice(i, 1)

			const newValue = L(props.exp.value[0], ...newParams)
			context.emit('input', nonReactive(newValue))
		}

		function onParamInsert(i: number) {
			if (!fnInfo.value?.meta) {
				return
			}

			const newParams = [...fnParams.value]

			const descVariadic = (fnInfo.value.meta[K_PARAMS] as MalVal[])[
				variadicPos.value + 1
			] as Desc

			const imin = variadicPos.value
			const imax = newParams.length - 1

			let insertedValue

			const type = descVariadic[K_TYPE]
			const descDefault = descVariadic[K_DEFAULT]
			const typeDefault = TypeDefaults[type]
			const interporateFunc = InterpolateFuncs[type] || null

			if (descDefault !== undefined) {
				insertedValue = descDefault
			} else if (typeDefault) {
				insertedValue = typeDefault
			} else if (interporateFunc) {
				const a = newParams[clamp(i - 1, imin, imax)]
				const b = newParams[clamp(i, imin, imax)]
				insertedValue = interporateFunc(a, b)
			} else {
				insertedValue = cloneExp(newParams[clamp(i - 1, imin, imax)])
			}

			newParams.splice(i, 0, insertedValue)

			const newValue = L(props.exp.value[0], ...newParams)
			context.emit('input', nonReactive(newValue))
		}

		// Use inside the template
		function symbolValidator(v: string) {
			return v.trim() ? S(v) : null
		}

		function keywordValidator(v: string) {
			return v.trim() ? K(v) : null
		}

		return {
			params,
			paramDescs,
			variadicPos,
			onParamInput,
			onParamDelete,
			onParamInsert,
			onSelect,
			keywordValidator,
			symbolValidator,
			nonReactive,
		}
		*/
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
