<template>
	<div class="MalInputColor">
		<InputColor
			class="MalInputColor__picker"
			v-if="mode"
			:value="pickerValue"
			:mode="mode"
			@input="onInputColor"
		/>
		<div class="MalInputColor__hex" v-if="compact">{{ hexValue }}</div>
		<template v-else>
			<InputDropdown
				class="MalInputColor__mode"
				:value="mode"
				:values="['HEX', 'RGB', 'HSL']"
				@input="changeMode"
			/>
			<div class="MalInputColor__text" v-if="mode === 'HEX'">
				<InputString :value="displayValues" @input="onInputText" />
			</div>
			<div class="MalInputColor__elements" v-else-if="mode">
				(
				<MalInputNumber
					v-for="(value, i) in displayValues"
					:key="i"
					:compact="true"
					class="MalInputColor__el"
					:value="value"
					:validator="validators[i]"
					@input="onInputNumber(i, $event)"
				/>)
			</div>
		</template>
	</div>
</template>

<script lang="ts">
import chroma from 'chroma-js'
import {
	defineComponent,
	PropType,
	computed,
	ComputedRef,
	SetupContext,
} from '@vue/composition-api'
import {
	MalVal,
	MalType,
	getType,
	isSymbol,
	getEvaluated,
	isList,
	createList as L,
	symbolFor as S,
	MalSeq,
} from '@/mal/types'
import InputColor from '@/components/inputs/InputColor.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import MalInputNumber from './MalInputNumber.vue'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '../../utils'

type ColorMode = 'HEX' | 'RGB' | 'HSL'

const COLOR_SPACE_FUNCTIONS = new Set(['color/rgb', 'color/hsl'])
const COLOR_SPACE_SHORTHANDS = new Set(['rgb', 'hsl'])

interface Props {
	value: NonReactive<string | MalSeq>
}

export default defineComponent({
	components: {InputColor, InputString, InputDropdown, MalInputNumber},
	props: {
		value: {
			required: true,
			validator: v => v instanceof NonReactive,
		},
		compact: {
			default: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		const mode = computed(() => {
			switch (getType(props.value.value)) {
				case MalType.String: {
					{
						const str = props.value.value as string
						if (chroma.valid(str)) {
							return 'HEX'
						}
						break
					}
				}
				case MalType.List: {
					const fst = (props.value.value as MalVal[])[0]
					if (isSymbol(fst)) {
						if (COLOR_SPACE_FUNCTIONS.has(fst.value)) {
							return fst.value.split('/')[1].toUpperCase()
						} else if (COLOR_SPACE_SHORTHANDS.has(fst.value)) {
							return fst.value.toUpperCase()
						}
					}
					break
				}
			}
			return 'HEX'
		}) as ComputedRef<ColorMode | null>

		const displayValues = computed(() => {
			if (mode.value === null) {
				return null
			}

			if (typeof props.value.value === 'string') {
				return props.value.value
			} else if (isList(props.value.value)) {
				return props.value.value.slice(1).map(nonReactive)
			}
		})

		const chromaColor = computed(() => {
			if (!mode.value) return null

			const value = props.value.value

			let color: chroma.Color
			switch (mode.value) {
				case 'HEX':
					color = chroma.valid(value as string)
						? chroma(value as string)
						: chroma('black')
					break
				case 'RGB': {
					const [, r, g, b] = (value as MalVal[]).map(v =>
						getEvaluated(v)
					) as number[]
					color = chroma(r * 255, g * 255, b * 255, 'rgb')
					break
				}
				case 'HSL': {
					const evaluated = (value as MalVal[]).map(v =>
						getEvaluated(v)
					) as number[]
					let [, h] = evaluated
					const [, , s, l] = evaluated
					if (isNaN(h)) {
						h = 0
					}
					color = chroma((h / Math.PI) * 180, s, l, 'hsl')
					break
				}
			}

			if (isList(value) && value.length >= 5) {
				color = color.alpha(getEvaluated(value[4]) as number)
			}

			return color
		})

		const pickerValue = computed(() => {
			if (!mode.value || !chromaColor.value) return null
			return chromaColor.value.css()
		})

		const hexValue = computed(() => {
			if (!mode.value || !chromaColor.value) return null
			return chromaColor.value.hex().slice(0, 7)
		})

		const validators = computed(() => {
			switch (mode.value) {
				case 'RGB':
					return [
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne,
					]
				case 'HSL':
					return [
						validatorZeroTwoPI,
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne,
					]
			}

			return []
		})

		function changeMode(mode: ColorMode) {
			if (!pickerValue.value) return

			const color = chroma(pickerValue.value)

			let value

			switch (mode) {
				case 'HEX':
					value = color.hex('auto')
					break
				case 'RGB':
					value = L(S('rgb'), ...color.rgb().map(v => v / 255))
					break
				case 'HSL': {
					const [h, s, l] = color.hsl()
					value = L(S('hsl'), ((h || 0) / 180) * Math.PI, s, l)
					break
				}
			}

			if (color.alpha() < 1 && mode !== 'HEX') {
				;(value as MalVal[]).push(color.alpha())
			}

			context.emit('input', nonReactive(value))
		}

		function onInputText(str: string) {
			context.emit('input', nonReactive(str))
		}

		function onInputNumber(i: number, v: NonReactive<number>) {
			const newExp = L(...(props.value.value as MalVal[]))
			newExp[i + 1] = v.value
			context.emit('input', nonReactive(newExp))
		}

		function onInputColor(color: any) {
			let value: MalVal =
				typeof props.value === 'string'
					? ''
					: L(...(props.value.value as MalVal[]))

			switch (mode.value) {
				case 'HEX':
					if (color.a < 1) {
						value = color.hex8
					} else {
						value = color.hex
					}
					break
				case 'RGB': {
					let {r, g, b} = color.rgba
					r = reverseEval(r / 255, (props.value.value as MalVal[])[1])
					g = reverseEval(g / 255, (props.value.value as MalVal[])[2])
					b = reverseEval(b / 255, (props.value.value as MalVal[])[3])
					;(value as MalVal[])[1] = r
					;(value as MalVal[])[2] = g
					;(value as MalVal[])[3] = b
					break
				}
				case 'HSL': {
					let {h, s, l} = color.hsl
					h = reverseEval(
						(h / 180) * Math.PI,
						(props.value.value as MalVal[])[1]
					)
					s = reverseEval(s, (props.value.value as MalVal[])[2])
					l = reverseEval(l, (props.value.value as MalVal[])[3])
					;(value as MalVal[])[1] = h
					;(value as MalVal[])[2] = s
					;(value as MalVal[])[3] = l
				}
			}

			if (mode.value !== 'HEX') {
				if (color.a < 0.9999) {
					const a =
						(props.value.value as MalVal[])[4] !== undefined
							? reverseEval(color.a, (props.value.value as MalVal[])[4])
							: color.a
					;(value as MalVal[])[4] = a
				} else {
					value = L(...(value as MalVal[]).slice(0, 4))
				}
			}

			context.emit('input', nonReactive(value))
		}

		function validatorZeroOne(x: number) {
			return Math.max(0, Math.min(x, 1))
		}

		function validatorZeroTwoPI(x: number) {
			return Math.max(0, Math.min(x, Math.PI * 2))
		}

		return {
			mode,
			displayValues,
			hexValue,
			validators,
			pickerValue,
			changeMode,
			onInputText,
			onInputNumber,
			onInputColor,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputColor
	display flex
	line-height $input-height

	&__picker
		margin-right 0.2em

	&__hex
		margin-left 0.3rem
		color var(--comment)
		font-monospace()

	&__mode
		margin-right 0.2em
		width 3.5em
		border-bottom-color transparent
		color var(--comment)
		font-monospace()

	&__text
		display flex
		font-monospace()

	&__elements
		display flex

	&__el
		margin-right 0.7em
		width 3.3em

		&:last-child
			margin-right 0.3em
</style>
