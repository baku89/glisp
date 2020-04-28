<template>
	<div class="Inspector">
		<div class="Inspector__header" v-if="isFuncCall">
			<div class="Inspector__name">{{ fnName }}</div>
			<div class="Inspector__desc">{{ fnDesc }}</div>
		</div>
		<div class="Inspector__params">
			<div v-for="(pd, i) in paramsDesc" :key="i" class="Inspector__param">
				<label class="label">{{ pd['ʞlabel'] }}</label>
				<InputString
					v-if="isSymbol(params[i])"
					:value="params[i].slice(1)"
					:validator="prohibitBlank"
					@input="onSymbolParamInput(i, $event)"
				/>
				<InputNumber
					v-else-if="pd['ʞtype'] === 'number' && typeof params[i] === 'number'"
					:value="params[i]"
					@input="onParamInput(i, $event)"
				/>
				<InputString
					v-else-if="pd['ʞtype'] === 'string' && typeof params[i] === 'string'"
					:value="params[i]"
					@input="onParamInput(i, $event)"
				/>
				<InputVec2
					v-else-if="
						pd['ʞtype'] === 'vec2' &&
							Array.isArray(params[i]) &&
							typeof params[i][0] === 'number' &&
							typeof params[i][1] === 'number'
					"
					:value="params[i]"
					@input="onParamInput(i, $event)"
				/>
				<div v-else class="expr">{{ printExp(params[i]) }}</div>
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
	symbolFor
} from '@/mal/types'
import printExp from '@/mal/printer'
import InputComponents from '@/components/input'

const K_DOC = K('doc'),
	K_PARAMS = K('params'),
	K_TYPE = K('type')

@Component({
	name: 'Inspector',
	components: {
		...InputComponents
	}
})
export default class Inspector extends Vue {
	@Prop({required: true}) private value!: MalVal

	private prohibitBlank(v: string) {
		return v.trim() ? v : null
	}

	private isSymbol(x: MalVal) {
		return isSymbol(x)
	}

	private printExp(x: MalVal) {
		return printExp(x)
	}

	private get isFuncCall() {
		return isList(this.value) && isSymbol(this.value[0])
	}

	private get params(): MalVal[] {
		return this.isFuncCall ? (this.value as MalVal[]).slice(1) : [this.value]
	}

	private get fnName(): string {
		if (this.isFuncCall) {
			return ((this.value as MalVal[])[0] as string).slice(1)
		} else {
			return ''
		}
	}

	private get meta(): any | null {
		const value = this.value as any
		if (value && value[M_FN]) {
			return value[M_FN][M_META] || null
		} else {
			return null
		}
	}

	private get fnDesc(): string {
		if (this.meta !== null) {
			if (typeof this.meta === 'string') {
				return this.meta
			} else {
				return (this.meta[K_DOC] as string) || ''
			}
		} else {
			return ''
		}
	}

	private matchParameter(params: any[], paramDesc: any[]): any | null {
		if (params.length !== paramDesc.length) {
			return null // Insufficient parameters
		}

		for (let pi = 0; pi < params.length; pi++) {
			const desc = paramDesc[pi]
			const param = params[pi]

			if (isSymbol(param) || desc[K('type')] === 'any') {
				continue
			}
			if (desc[K('check')]) {
				const checkFn: any = desc[K('check')]
				if (!checkFn(param)) {
					return null
				}
			} else if (getType(param) !== desc[K('type')]) {
				return null
			}
		}

		return paramDesc
	}

	private get paramsDesc(): any {
		const value = this.value as any
		let paramsDesc = null

		const fn = value ? value[M_FN] : null
		const fnParams = isMalFunc(fn) ? fn[M_PARAMS] : null

		// Check if the function has parmeter info as metadata
		if (this.meta && this.meta[K_PARAMS]) {
			const metaParamsDesc = this.meta[K_PARAMS]

			if (Array.isArray(metaParamsDesc[0])) {
				// Has overloads then try to match the parameter
				for (const desc of metaParamsDesc) {
					const ret = this.matchParameter(this.params, desc)
					if (ret !== null) {
						paramsDesc = ret
						break
					}
				}
			} else {
				paramsDesc = this.matchParameter(this.params, metaParamsDesc)
			}
		}

		// else use parameter info of MalFunc
		if (!paramsDesc && fnParams) {
			paramsDesc = fnParams.map((fp, i) => {
				const p = this.params[i]

				const type = getType(p)

				return type ? {ʞtype: type} : {ʞtype: 'any'}
			})
		}

		// Set Neccessary info
		if (paramsDesc) {
			paramsDesc = paramsDesc.map((_desc: any, i: number) => {
				const desc = {..._desc}

				// Set label from params if exists
				if (!desc['ʞlabel']) {
					desc['ʞlabel'] =
						fnParams && fnParams[i]
							? Case.capital((fnParams[i] as string).slice(1))
							: ''
				}

				// Set the type if it is not specified or set to any
				if (!desc['ʞtype'] || desc['ʞtype'] === 'any') {
					desc['ʞtype'] = getType(this.params[i])
				}
				return desc
			})
		}

		return paramsDesc
	}

	private onSymbolParamInput(i: number, v: string) {
		this.onParamInput(i, symbolFor(v))
	}

	private onParamInput(i: number, v: MalVal) {
		const newValue = [...(this.value as MalVal[])]
		if (isVector(this.value)) {
			markMalVector(newValue)
		}
		newValue[i + 1] = v
		this.$emit('input', newValue)
	}
}
</script>

<style lang="stylus" scoped>
.Inspector
	padding 1rem
	height 100%
	text-align left
	position relative

	&:before
		position absolute
		content ''
		display block
		top 0
		left 0
		width 100%
		height 100%
		background var(--background)
		opacity .8
		z-index -1

	&__header
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

	&__param
		margin-bottom 0.5em

		.label
			float left
			clear both
			width 5em
			color var(--comment)

		.expr
			color var(--comment)
			white-space nowrap
			overflow hidden
			text-overflow ellipsis
</style>
