<template>
	<div class="Inspector">
		<div class="Inspector__header" v-if="fn">
			<div class="Inspector__name">
				{{ fnName }}
				<span v-if="isAlias" class="alias">--> alias for {{isAlias}}</span>
			</div>
			<VueMarkdown class="Inspector__desc" :source="fnDesc" />
		</div>
		<div class="Inspector__params" v-if="paramDescs">
			<div
				v-for="(desc, i) in paramDescs.descs"
				:key="i"
				class="Inspector__param"
				:class="{'is-default': params[i].isDefault}"
			>
				<label class="label">{{ desc['ʞlabel'] }}</label>
				<InputNumber
					v-if="params[i].type === 'number'"
					:value="params[i].value"
					:validator="desc['validator']"
					@input="onParamInput(i, $event)"
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
				<InputVec2
					v-else-if="params[i].type === 'vec2'"
					:value="params[i].value"
					@input="onParamInput(i, $event)"
				/>
				<InputString
					style="color: var(--purple)"
					v-else-if="params[i].type === 'symbol'"
					:value="params[i].value.slice(1)"
					:validator="symbolValidator"
					@input="onParamInput(i, $event)"
				/>
				<InputString
					v-else-if="params[i].type === 'keyword'"
					:value="params[i].value.slice(1)"
					:validator="keywordValidator"
					@input="onParamInput(i, $event)"
				/>
				<div v-else class="expr">{{ printExp(params[i].value) }}</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'
import Case from 'case'
import {
	MalVal,
	MalMap,
	M_FN,
	M_META,
	isList,
	isSymbol,
	isMap,
	keywordFor as K,
	isVector,
	M_PARAMS,
	MalBind,
	isMalFunc,
	markMalVector,
	getType,
	symbolFor as S,
	isString,
	isKeyword,
	assocBang
} from '@/mal/types'
import printExp from '@/mal/printer'
import InputComponents from '@/components/input'
import VueMarkdown from 'vue-markdown'

const K_DOC = K('doc'),
	K_PARAMS = K('params'),
	K_TYPE = K('type'),
	K_VARIADIC = K('variadic'),
	K_LABEL = K('label'),
	K_CONSTRAINTS = K('constraints'),
	K_DEFAULT = K('default'),
	K_KEY = K('key'),
	K_KEYS = K('keys'),
	K_ENUM = K('enum')

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

type MetaDescs = (Desc | string)[]

@Component({
	name: 'Inspector',
	components: {
		...InputComponents,
		VueMarkdown
	}
})
export default class Inspector extends Vue {
	@Prop({required: true}) private value!: MalVal

	private get fn() {
		return (isList(this.value) && (this.value as any)[M_FN]) || null
	}

	private get fnOrigMeta() {
		return this.fn && this.fn[M_META] ? this.fn[M_META] : null
	}

	private get isAlias(): string | null {
		return this.fnOrigMeta && K('alias') in this.fnOrigMeta
			? this.fnOrigMeta[K('alias')][K('name')]
			: null
	}

	private get fnName(): string {
		if (this.fn) {
			return ((this.value as MalVal[])[0] as string).slice(1) || ''
		} else {
			return ''
		}
	}

	private get fnParams(): MalVal[] | null {
		return this.fn ? (this.value as MalVal[]).slice(1) : null
	}

	private get fnMeta() {
		return this.isAlias
			? this.fnOrigMeta[K('alias')][K('meta')]
			: this.fnOrigMeta
	}

	private get fnDesc(): string {
		if (this.fnMeta) {
			return typeof this.fnMeta === 'string'
				? this.fnMeta
				: (this.fnMeta[K_DOC] as string) || ''
		} else {
			return ''
		}
	}

	private matchParameter(
		params: any[],
		metaDesc: MetaDescs
	): ParamDescs | null {
		const retDesc = []

		const restPos = metaDesc.indexOf(S_AMP)

		if (restPos === -1) {
			if (params.length === metaDesc.length) {
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
						[K_LABEL]: Case.capital(desc[K_KEY].slice(1))
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
		const type = getType(v)

		if (type === 'vector') {
			const allNumber = (v as MalVal[]).every(v => typeof v === 'number')
			if (allNumber) {
				switch ((v as MalVal[]).length) {
					case 2:
						return 'vec2'
					case 6:
						return 'mat2d'
				}
			}
		}

		return type || 'any'
	}

	private get paramDescs(): ParamDescs | null {
		if (!this.fn || !this.fnParams) {
			return null
		}

		const value = this.value as MalVal[]
		let paramDescs: ParamDescs | null = null
		const fnMetaParams = isMalFunc(this.fn) ? this.fn[M_PARAMS] : null

		// Check if the function has parmeter info as metadata
		if (typeof this.fnMeta === 'object' && K_PARAMS in this.fnMeta) {
			const metaDescs = this.fnMeta[K_PARAMS]

			if (Array.isArray(metaDescs[0])) {
				// Has overloads then try to match the parameter
				for (const desc of metaDescs as MetaDescs[]) {
					if ((paramDescs = this.matchParameter(this.fnParams, desc))) {
						break
					}
				}
			} else {
				paramDescs = this.matchParameter(this.fnParams, metaDescs)
			}
		} else if (fnMetaParams) {
			// else use parameter info of MalFunc
			const descs: Desc[] = fnMetaParams.map((fp, i) => {
				let type = 'any'
				if (this.fnParams) {
					const p = this.fnParams[i]
					type = this.detectInputType(p)
				}
				return {[K_TYPE]: type}
			})

			paramDescs = {
				descs,
				rest: null
			}
		}

		// Set Neccessary info
		if (paramDescs) {
			paramDescs.descs = paramDescs.descs.map((_desc, i) => {
				const desc = {..._desc}

				// Set label from params if exists
				if (!(K_LABEL in desc)) {
					desc[K_LABEL] =
						fnMetaParams && fnMetaParams[i]
							? Case.capital((fnMetaParams[i] as string).slice(1))
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
		return paramDescs
	}

	private getInputType(value: MalVal, desc: Desc): string {
		switch (desc[K_TYPE]) {
			case 'number':
				if (typeof value === 'number') return 'number'
				break
			case 'string':
				if (isString(value)) {
					if (K_ENUM in desc) {
						return 'dropdown'
					} else {
						return 'string'
					}
				}
				break
			case 'color':
				if (isString(value)) return 'color'
				break
			case 'vec2':
				if (
					Array.isArray(value) &&
					typeof value[0] === 'number' &&
					typeof value[1] === 'number'
				) {
					return 'vec2'
				}
				break
		}

		if (isSymbol(value)) {
			return 'symbol'
		} else if (isKeyword(value)) {
			return 'keyword'
		} else {
			return 'expr'
		}
	}

	private get params(): Param[] {
		if (!this.paramDescs || !this.fnParams) {
			return []
		}

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
					const type = this.getInputType(value, desc)

					params.push({type, value, isDefault})
				}
				return params
			}

			const isDefault = this.fnParams.length <= i && K_DEFAULT in desc
			const value = isDefault ? desc[K_DEFAULT] : this.fnParams[i]
			const type = this.getInputType(value, desc)

			params.push({type, value, isDefault})
		}
		return params
	}

	private onParamInput(i: number, value: MalVal) {
		if (!this.paramDescs || !this.fnParams) {
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

		const newValue = [(this.value as MalVal[])[0], ...newParams]

		this.$emit('input', newValue)
	}

	// Use inside the template
	private symbolValidator(v: string) {
		return v.trim() ? S(v) : null
	}

	private keywordValidator(v: string) {
		return v.trim() ? K(v) : null
	}

	private isSymbol(x: MalVal) {
		return isSymbol(x)
	}

	private printExp(x: MalVal) {
		return printExp(x)
	}
}
</script>

<style lang="stylus" scoped>
.Inspector
	position relative
	padding 1rem
	height 100%
	text-align left
	user-select none
	$param-height = 1.4em

	&:before
		position absolute
		top 0
		left 0
		z-index -1
		display block
		width 100%
		height 100%
		background var(--background)
		content ''
		opacity 0.8

	&__header
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

		.alias
			color var(--comment)
			font-weight normal
			font-size 0.95em

	&__param
		margin-bottom 0.5em
		height $param-height

		&.is-default
			opacity 0.5

		.label
			float left
			clear both
			width 5em
			height $param-height
			color var(--comment)
			line-height $param-height

		.expr
			overflow hidden
			height $param-height
			color var(--comment)
			text-overflow ellipsis
			white-space nowrap
			line-height $param-height
</style>
