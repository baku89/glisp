<template>
	<table class="ParamControl">
		<tr
			v-for="(desc, i) in paramDescs.descs"
			:key="i"
			class="ParamControl__param"
			:class="{'is-default': params[i].isDefault}"
		>
			<td class="label">{{ desc['ʞlabel'] }}</td>
			<td class="value">
				<div class="input">
					<MalInputNumber
						v-if="params[i].type === 'number'"
						:value="params[i].value"
						:compact="true"
						:validator="desc['ʞvalidator']"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputString
						v-else-if="params[i].type === 'string'"
						:value="params[i].value"
						:validator="desc['ʞvalidator']"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputDropdown
						v-else-if="params[i].type === 'dropdown'"
						:value="params[i].value"
						:values="desc['ʞenum']"
						:validator="desc['ʞvalidator']"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<MalInputColor
						v-else-if="params[i].type === 'color'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<MalInputAngle
						v-else-if="params[i].type === 'angle'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<MalInputVec2
						v-else-if="params[i].type === 'vec2'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputRect2d
						v-else-if="params[i].type === 'rect2d'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputMat2d
						v-else-if="params[i].type === 'mat2d'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputSeed
						v-else-if="params[i].type === 'seed'"
						:value="params[i].value"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputString
						style="color: var(--syntax-symbol)"
						v-else-if="params[i].type === 'symbol'"
						:value="params[i].value.value"
						:validator="symbolValidator"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<InputString
						style="color: var(--syntax-keyword)"
						v-else-if="params[i].type === 'keyword'"
						:value="params[i].value.slice(1)"
						:validator="keywordValidator"
						@input="onParamInput(i, $event)"
						@select="onSelect($event)"
					/>
					<MalExpButton v-else @click="onSelect($event)" :value="params[i].value" />
				</div>
				<button class="delete" v-if="i >= variadicPos" @click="onParamDelete(i)">
					<i class="far fa-times-circle" />
				</button>
				<button class="insert" v-if="i >= variadicPos" @click="onParamInsert(i)">&lt;-- Insert</button>
			</td>
		</tr>
		<tr v-if="paramDescs.rest && paramDescs.rest.type === 'variadic'">
			<td class="label"></td>
			<td class="value">
				<button class="add" @click="onParamInsert(params.length)">+ Add</button>
			</td>
		</tr>
	</table>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import {
	MalNodeSeq,
	getType,
	MalVal,
	keywordFor as K,
	MalError,
	M_PARAMS,
	malEquals,
	isMalFunc,
	assocBang,
	symbolFor as S,
	cloneExp,
	MalFunc,
	createList as L,
	isVector
} from '@/mal/types'
import InputComponents from '@/components/inputs'
import MalInputComponents from '@/components/mal-input'
import {getFnInfo, getPrimitiveType} from '../mal-utils'
import {nonReactive, getParamLabel, clamp, NonReactive} from '../utils'

interface Props {
	exp: NonReactive<MalNodeSeq>
	fn: MalFunc
}

const K_PARAMS = K('params'),
	K_TYPE = K('type'),
	K_LABEL = K('label'),
	K_DEFAULT = K('default'),
	K_KEY = K('key'),
	K_KEYS = K('keys')

const S_AMP = S('&')

interface Desc {
	[keyword: string]: any
}

type RestType = null | 'variadic' | 'keyword'

interface Param {
	type: string
	value: MalVal[]
	isDefault: boolean
}

interface ParamDescs {
	descs: Desc[]
	rest: null | {
		pos: number
		type: RestType
	}
}

const EmptyParamDescs = {
	descs: [],
	rest: null
}

const TypeDefaults = {
	number: 0,
	vec2: [0, 0],
	path: [K('path')]
} as {[type: string]: MalVal}

const InterpolateFuncs = {
	number: (a: number, b: number) => (a + b) / 2,
	vec2: (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
} as {[type: string]: (...xs: MalVal[]) => MalVal}

type MetaDescs = (Desc | string)[]

export default defineComponent({
	name: 'ParamControl',
	props: {
		exp: {required: true},
		fn: {required: false}
	},
	components: {
		...InputComponents,
		...MalInputComponents
	},
	setup(props: Props, context) {
		const fnInfo = computed(() => {
			return getFnInfo(props.fn || props.exp.value)
		})

		// The parameter part of exp
		const fnParams = computed(() => {
			if (fnInfo.value) {
				if (fnInfo.value.primitive) {
					return [props.exp.value]
				} else {
					return props.exp.value.slice(1)
				}
			} else {
				return []
			}
		})

		function detectInputType(v: MalVal) {
			return getPrimitiveType(v) || getType(v) || 'any'
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
							[K_LABEL]: getParamLabel(desc[K_KEY])
						}
						return {...predefinedDesc, ...desc}
					})
					return {
						descs: [...requiredDescs, ...keywordsDescs] as Desc[],
						rest: {
							pos: restPos,
							type: 'keyword'
						}
					}
				} else {
					// Variadic args
					const restParamCount = params.slice(restPos).length

					const restDescs = Array(restParamCount).fill(restDesc)
					return {
						descs: [...requiredDescs, ...restDescs] as Desc[],
						rest: {
							pos: restPos,
							type: 'variadic'
						}
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
								[K_LABEL]: j === i ? getParamLabel(fnMetaParams[i + 1]) : ''
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
					rest: null
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
						const value = isDefault ? desc[K_DEFAULT] : hm[key]
						const type = matchInputTypeOfValueAndDesc(value, desc)

						params.push({type, value, isDefault})
					}
					return params
				}

				const isDefault = fnParams.value.length <= i && K_DEFAULT in desc
				const value = isDefault ? desc[K_DEFAULT] : fnParams.value[i]
				const type = matchInputTypeOfValueAndDesc(value, desc)

				params.push({type, value, isDefault})
			}
			return params
		})

		function matchInputTypeOfValueAndDesc(value: MalVal, desc: Desc): string {
			const inputType = detectInputType(value)
			const descType = desc[K_TYPE]
			if (inputType !== descType) {
				if (descType === 'any') {
					return inputType
				} else if (/^number|angle|vec2|color|dropdown$/.test(descType)) {
					return descType
				} else if (descType === 'seed' && inputType === 'number') {
					return 'seed'
				} else if (descType) {
					return 'exp'
				}
			}
			return descType
		}

		function onParamInput(i: number, value: MalVal) {
			if (!fnInfo.value) {
				return
			}

			const {descs, rest} = paramDescs.value

			// Clone the required part of params
			const newParams = []
			if (rest && rest.type === 'keyword' && rest.pos <= i) {
				const restIndex = i - rest.pos

				const restDescs = descs.slice(rest.pos)
				const restParams = params.value.slice(rest.pos)

				// Figure out which parameters have modified
				const modifiedParams = []
				for (let j = 0; j < restParams.length; j++) {
					const param = restParams[j]
					const desc = restDescs[j]

					const v = j === restIndex ? value : param.value
					const isDefault = v === desc[K_DEFAULT]

					if (!isDefault) {
						const key = desc[K_KEY]
						modifiedParams.push(key, v)
					}
				}

				newParams.push(...fnParams.value.slice(0, rest.pos), ...modifiedParams)
			} else {
				newParams.push(...fnParams.value)
				newParams[i] = value
			}
			// Check if the parameters can be made shorter
			if (!rest || newParams.length <= rest.pos) {
				for (let j = newParams.length - 1; 0 <= j; j--) {
					if (newParams[j] !== descs[j][K_DEFAULT]) {
						break
					}
					newParams.pop()
				}
			}

			let newValue

			if (fnInfo.value?.primitive) {
				newValue = newParams[0]
			} else {
				newValue = L(props.exp.value[0], ...newParams)
			}

			context.emit('input', nonReactive(newValue))
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

		function onSelect(exp: MalVal) {
			context.emit('select', nonReactive(exp))
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
			symbolValidator
		}
	}
})
</script>

<style lang="stylus">
@import './style/common.styl'

.ParamControl
	position relative
	width 100%
	table-layout fixed

	&__param
		height $param-height

		&.is-default
			opacity 0.5

		td
			padding 0.1em 0

			&:first-child
				width 5em

		.label
			clear both
			padding-right 1em
			height $param-height
			color var(--comment)
			white-space nowrap
			line-height $param-height

		.value
			display flex
			width 99%

		.input
			max-width calc(100% - 2rem)

	button
		height $param-height
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
			// position absolute
			position relative
			// background blue
			font-weight normal
			opacity 0
			transform translate(-1em, -66%)

			&:hover
				color var(--hover)

			&:before
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
