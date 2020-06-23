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
				<button class="Inspector__outer" v-if="outer" @click="onSelect(outer)">
					<i class="fas fa-level-up-alt" />
				</button>
			</div>
			<VueMarkdown :source="fnDoc" />
		</div>
		<table class="Inspector__params">
			<tr
				v-for="(desc, i) in paramDescs.descs"
				:key="i"
				class="Inspector__param"
				:class="{'is-default': params[i].isDefault}"
			>
				<td class="label">{{ desc['ʞlabel'] }}</td>
				<td class="value">
					<div class="input">
						<MalInputNumber
							v-if="params[i].type === 'number'"
							:value="params[i].value"
							:validator="desc['validator']"
							@input="onParamInput(i, $event)"
							@select="onSelect(params[i].value)"
						/>
						<InputString
							v-else-if="params[i].type === 'string'"
							:value="params[i].value"
							:validator="desc['validator']"
							@input="onParamInput(i, $event)"
						/>
						<InputDropdown
							v-else-if="params[i].type === 'dropdown'"
							:value="params[i].value"
							:values="desc['ʞenum']"
							:validator="desc['validator']"
							@input="onParamInput(i, $event)"
						/>
						<InputColor
							v-else-if="params[i].type === 'color'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<MalInputAngle
							v-else-if="params[i].type === 'angle'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<MalInputVec2
							v-else-if="params[i].type === 'vec2'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<InputRect2d
							v-else-if="params[i].type === 'rect2d'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<InputMat2d
							v-else-if="params[i].type === 'mat2d'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<InputSeed
							v-else-if="params[i].type === 'seed'"
							:value="params[i].value"
							@input="onParamInput(i, $event)"
						/>
						<InputString
							style="color: var(--purple)"
							v-else-if="params[i].type === 'symbol'"
							:value="params[i].value.value"
							:validator="symbolValidator"
							@input="onParamInput(i, $event)"
						/>
						<InputString
							v-else-if="params[i].type === 'keyword'"
							:value="params[i].value.slice(1)"
							:validator="keywordValidator"
							@input="onParamInput(i, $event)"
						/>
						<MalExpButton
							v-else
							@click="onSelect(params[i].value)"
							:value="params[i].value"
						/>
					</div>
					<button
						class="delete"
						v-if="i >= variadicPos"
						@click="onParamDelete(i)"
					>
						<i class="far fa-times-circle" />
					</button>
					<button
						class="insert"
						v-if="i >= variadicPos"
						@click="onParamInsert(i)"
					>
						&lt;-- Insert
					</button>
				</td>
			</tr>
			<tr v-if="paramDescs.rest && paramDescs.rest.type === 'variadic'">
				<td class="label"></td>
				<td class="value">
					<button class="add" @click="onParamInsert(params.length)">
						+ Add
					</button>
				</td>
			</tr>
		</table>
	</div>
</template>

<script lang="ts">
import {Component, Vue, Prop} from 'vue-property-decorator'
import VueMarkdown from 'vue-markdown'

import {
	MalVal,
	isList,
	isSymbol,
	keywordFor as K,
	M_PARAMS,
	isMalFunc,
	markMalVector,
	getType,
	symbolFor as S,
	assocBang,
	cloneExp,
	MalNode,
	LispError,
	malEquals,
	MalSymbol,
	M_OUTER
} from '@/mal/types'
import printExp from '@/mal/printer'
import InputComponents from '@/components/input'
import MalInputComponents from '@/components/mal-input'
import {clamp, getParamLabel, NonReactive, nonReactive} from '@/utils'
import {getFnInfo, getPrimitiveType} from '../mal-utils'

const K_PARAMS = K('params'),
	K_TYPE = K('type'),
	K_LABEL = K('label'),
	K_CONSTRAINTS = K('constraints'),
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
	vec2: markMalVector([0, 0]),
	path: markMalVector([K('path')])
} as {[type: string]: MalVal}

const InterpolateFuncs = {
	number: (a: number, b: number) => (a + b) / 2,
	vec2: (a: number[], b: number[]) =>
		markMalVector([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
} as {[type: string]: (...xs: MalVal[]) => MalVal}

type MetaDescs = (Desc | string)[]

@Component({
	name: 'Inspector',
	components: {
		...InputComponents,
		...MalInputComponents,
		VueMarkdown
	}
})
export default class Inspector extends Vue {
	@Prop({
		required: true,
		validator: p => p instanceof NonReactive
	})
	private exp!: NonReactive<MalNode>

	private get fnInfo() {
		return getFnInfo(this.exp.value)
	}

	private get fnName(): string {
		if (this.fnInfo?.primitive) {
			return this.fnInfo.primitive
		} else if (
			this.fnInfo?.fn ||
			(isList(this.exp.value) && isSymbol(this.exp.value[0]))
		) {
			return ((this.exp.value as MalVal[])[0] as MalSymbol).value || ''
		} else {
			return ''
		}
	}

	private get fnParams(): MalVal[] {
		if (this.fnInfo?.primitive) {
			return [this.exp.value]
		} else if (this.fnInfo) {
			return (this.exp.value as MalVal[]).slice(1)
		} else {
			return []
		}
	}

	private get fnDoc(): string {
		if (this.fnInfo?.meta) {
			return this.fnInfo.meta[K('doc')] as string
		}
		return ''
	}

	private get outer(): MalVal | undefined {
		if (this.exp.value[M_OUTER][M_OUTER]) {
			return this.exp.value[M_OUTER]
		}
		return undefined
	}

	private matchParameter(
		params: any[],
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

	private detectInputType(v: MalVal) {
		return getPrimitiveType(v) || getType(v) || 'any'
	}

	private get paramDescs(): ParamDescs {
		if (!this.fnInfo) {
			return EmptyParamDescs
		}

		let paramDescs: ParamDescs | null = null
		const fnMetaParams = isMalFunc(this.fnInfo.fn)
			? this.fnInfo.fn[M_PARAMS]
			: null

		// Check if the function has parmeter info as metadata
		if (this.fnInfo && this.fnInfo.meta && K_PARAMS in this.fnInfo.meta) {
			const metaDescs = this.fnInfo.meta[K_PARAMS] as MetaDescs | MetaDescs[]

			if (!Array.isArray(metaDescs)) {
				throw new LispError('Invalid params scheme')
			}

			if (Array.isArray(metaDescs[0])) {
				// Has overloads then try to match the parameter
				for (const desc of metaDescs) {
					if (
						(paramDescs = this.matchParameter(this.fnParams, desc as MetaDescs))
					) {
						break
					}
				}
				if (!paramDescs) {
					// If no overloads matched, force apply first overload
					paramDescs = this.matchParameter(this.fnParams, metaDescs[0], true)
				}
			} else {
				paramDescs = this.matchParameter(this.fnParams, metaDescs)
			}
		} else if (fnMetaParams) {
			// else use parameter info of MalFunc
			const descs: Desc[] = []

			for (let i = 0; i < fnMetaParams.length; i++) {
				// Variadic parameter
				if (malEquals(fnMetaParams[i], S_AMP)) {
					for (let j = i; j < this.fnParams.length; j++) {
						const type = this.fnParams
							? this.detectInputType(this.fnParams[j])
							: 'any'
						descs.push({
							[K_TYPE]: type,
							[K_LABEL]: j === i ? getParamLabel(fnMetaParams[i + 1]) : ''
						})
					}
					break
				}

				const type = this.fnParams
					? this.detectInputType(this.fnParams[i])
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

			const restPos = rest && rest.type === 'variadic' ? rest.pos : descs.length

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

				// Make validator function
				if (K_CONSTRAINTS in desc) {
					const constraints = desc[K_CONSTRAINTS]

					let validator = (v: any) => v

					for (const [key, param] of Object.entries(constraints) as [
						string,
						number
					][]) {
						const _v = validator
						switch (key.slice(1) as string) {
							case 'min':
								validator = (v: number) => Math.max(param, _v(v))
								break
							case 'max':
								validator = (v: number) => Math.min(param, _v(v))
								break
							case 'step':
								validator = (v: number) => Math.round(_v(v) / param) * param
						}
					}
					desc['validator'] = validator
					delete desc[K_CONSTRAINTS]
				}

				return desc
			})
		}
		return paramDescs || EmptyParamDescs
	}

	private get variadicPos(): number {
		if (this.paramDescs.rest && this.paramDescs.rest.type === 'variadic') {
			return this.paramDescs.rest.pos
		} else {
			return this.paramDescs.descs.length
		}
	}

	private get params(): Param[] {
		const params: Param[] = []

		const {descs, rest} = this.paramDescs

		for (let i = 0; i < descs.length; i++) {
			const desc = descs[i]

			if (rest && rest.type === 'keyword' && rest.pos <= i) {
				const hm = assocBang({}, ...this.fnParams.slice(i))

				for (let j = i; j < descs.length; j++) {
					const desc = descs[j]
					const key = desc[K_KEY]

					const isDefault = !(key in hm) && K_DEFAULT in desc
					const value = isDefault ? desc[K_DEFAULT] : hm[key]
					const type = this.matchInputTypeOfValueAndDesc(value, desc)

					params.push({type, value, isDefault})
				}
				return params
			}

			const isDefault = this.fnParams.length <= i && K_DEFAULT in desc
			const value = isDefault ? desc[K_DEFAULT] : this.fnParams[i]
			const type = this.matchInputTypeOfValueAndDesc(value, desc)

			params.push({type, value, isDefault})
		}
		return params
	}

	private matchInputTypeOfValueAndDesc(value: MalVal, desc: Desc): string {
		const inputType = this.detectInputType(value)
		const descType = desc[K_TYPE]
		if (inputType !== descType) {
			if (descType === 'any') {
				return inputType
			} else if (/^number|angle$/.test(descType)) {
				return descType
			} else if (descType === 'color' && inputType === 'string') {
				return 'color'
			} else if (descType === 'angle' && inputType === 'number') {
				return 'angle'
			} else if (descType === 'seed' && inputType === 'number') {
				return 'seed'
			} else if (descType) {
				return 'exp'
			}
		}
		return descType
	}

	private onParamInput(i: number, value: MalVal) {
		if (!this.fnParams || !this.fnInfo) {
			return
		}

		const {descs, rest} = this.paramDescs

		// Clone the required part of params
		const newParams = []
		if (rest && rest.type === 'keyword' && rest.pos <= i) {
			const restIndex = i - rest.pos

			const restDescs = descs.slice(rest.pos)
			const restParams = this.params.slice(rest.pos)

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

			newParams.push(...this.fnParams.slice(0, rest.pos), ...modifiedParams)
		} else {
			newParams.push(...this.fnParams)
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

		if (this.fnInfo?.primitive) {
			newValue = markMalVector(newParams[0])
		} else {
			newValue = [(this.exp.value as MalVal[])[0], ...newParams]
		}

		this.$emit('input', nonReactive(newValue))
	}

	private onParamDelete(i: number) {
		if (!this.fnInfo) {
			return
		}

		const newParams = [...this.fnParams]
		newParams.splice(i, 1)

		const newValue = [(this.exp.value as MalVal[])[0], ...newParams]
		this.$emit('input', nonReactive(newValue))
	}

	private onParamInsert(i: number) {
		if (!this.fnInfo?.meta) {
			return
		}

		const newParams = [...this.fnParams]

		const descVariadic = (this.fnInfo.meta[K_PARAMS] as MalVal[])[
			this.variadicPos + 1
		] as Desc

		const imin = this.variadicPos
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

		const newValue = [(this.exp.value as MalVal[])[0], ...newParams]
		this.$emit('input', nonReactive(newValue))
	}

	private onSelect(exp: MalVal) {
		console.log('exp')
		this.$emit('select', nonReactive(exp))
	}

	// Use inside the template
	private symbolValidator(v: string) {
		return v.trim() ? S(v) : null
	}

	private keywordValidator(v: string) {
		return v.trim() ? K(v) : null
	}

	private printExp(x: MalVal) {
		return printExp(x)
	}
}
</script>

<style lang="stylus" scoped>
@import 'style/common.styl'

.Inspector
	position relative
	padding 1rem
	height 100%
	text-align left
	user-select none
	translucent-bg()

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

	&__params
		position relative
		width 100%
		table-layout fixed

	&__param
		margin 0.25em 0
		height $param-height

		&.is-default
			opacity 0.5

		td
			padding 0

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
			max-width 100%

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
