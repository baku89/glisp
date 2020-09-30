<template>
	<div class="MalInputColor">
		<InputColor
			class="MalInputColor__picker"
			v-if="mode"
			:value="pickerValue"
			:mode="mode"
			@input="onInputColor"
			@end-tweak="$emit('end-tweak')"
		/>
		<div class="MalInputColor__hex" v-if="compact">{{ hexValue }}</div>
		<template v-else>
			<template v-if="mode === 'EXP'">
				<InputString
					class="MalInputColor__text exp"
					:value="displayValues"
					@input="onInputText"
					@end-tweak="$emit('end-tweak')"
				/>
				<MalExpButton
					class="MalInputColor__exp"
					:value="value"
					:compact="false"
					@select="$emit('select', $event)"
				/>
			</template>
			<template v-else>
				<InputDropdown
					class="MalInputColor__mode simple"
					:value="mode"
					:values="['HEX', 'RGB', 'HSL']"
					@input="changeMode"
					@end-tweak="$emit('end-tweak')"
				/>
				<InputString
					v-if="mode === 'HEX'"
					class="MalInputColor__text"
					:value="displayValues"
					@input="onInputText"
					@end-tweak="$emit('end-tweak')"
				/>
				<div class="MalInputColor__elements" v-else-if="mode">
					<MalInputNumber
						v-for="(value, i) in displayValues"
						:key="i"
						:compact="true"
						class="MalInputColor__el"
						:value="value"
						:validator="validators[i]"
						@input="onInputNumber(i, $event)"
						@end-tweak="$emit('end-tweak')"
					/>
				</div>
			</template>
		</template>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, ComputedRef, PropType} from 'vue'
import chroma from 'chroma-js'
import {
	MalVal,
	MalType,
	getType,
	isSymbol,
	getEvaluated,
	isList,
	MalList,
	MalSymbol,
	MalSeq,
} from '@/mal/types'
import InputColor from '@/components/inputs/InputColor.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import MalInputNumber from './MalInputNumber.vue'
import MalExpButton from './MalExpButton.vue'
import {reverseEval} from '@/mal/utils'

type ColorMode = 'HEX' | 'RGB' | 'HSL' | 'EXP'

const COLOR_SPACE_FUNCTIONS = new Set(['color/rgb', 'color/hsl'])
const COLOR_SPACE_SHORTHANDS = new Set(['rgb', 'hsl'])

export default defineComponent({
	name: 'MalInputColor',
	components: {
		InputColor,
		InputString,
		InputDropdown,
		MalInputNumber,
		MalExpButton,
	},
	props: {
		value: {
			type: [String, Array] as PropType<string | MalSeq>,
			required: true,
		},
		compact: {
			default: false,
		},
	},
	setup(props, context) {
		const mode = computed(() => {
			switch (getType(props.value)) {
				case MalType.String: {
					{
						const str = props.value as string
						if (chroma.valid(str)) {
							return 'HEX'
						}
						break
					}
				}
				case MalType.List: {
					const fst = (props.value as MalVal[])[0]
					if (isSymbol(fst)) {
						if (COLOR_SPACE_FUNCTIONS.has(fst.value)) {
							return fst.value.split('/')[1].toUpperCase()
						} else if (COLOR_SPACE_SHORTHANDS.has(fst.value)) {
							return fst.value.toUpperCase()
						}
					}
					return 'EXP'
				}
				case MalType.Symbol: {
					return 'EXP'
				}
			}
			return 'HEX'
		}) as ComputedRef<ColorMode>

		const displayValues = computed(() => {
			if (mode.value === 'EXP') {
				return getEvaluated(props.value) as string
			}

			if (typeof props.value === 'string') {
				return props.value
			} else if (isList(props.value)) {
				return props.value.slice(1)
			}
		})

		const chromaColor = computed(() => {
			const value = props.value

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
				case 'EXP': {
					color = chroma(getEvaluated(value) as string)
					break
				}
			}

			if (mode.value !== 'EXP' && isList(value) && value.length >= 5) {
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
					value = L(MalSymbol.create('rgb'), ...color.rgb().map(v => v / 255))
					break
				case 'HSL': {
					const [h, s, l] = color.hsl()
					value = L(MalSymbol.create('hsl'), ((h || 0) / 180) * Math.PI, s, l)
					break
				}
			}

			if (color.alpha() < 1 && mode !== 'HEX') {
				;(value as MalVal[]).push(color.alpha())
			}

			context.emit('input', value)
		}

		function onInputText(str: string) {
			if (mode.value !== 'EXP') {
				context.emit('input', str)
			} else {
				// Inverse evaluation
				const newExp = reverseEval(str, props.value)
				context.emit('input', newExp)
			}
		}

		function onInputNumber(i: number, v: number) {
			const newExp = L(...(props.value as MalVal[]))
			newExp[i + 1] = v
			context.emit('input', newExp)
		}

		function onInputColor(color: {
			a: number
			hex: string
			hex8: string
			rgba: {r: number; g: number; b: number}
			hsl: {h: number; s: number; l: number}
		}) {
			let value: MalVal = isList(props.value) ? L(...props.value) : ''

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
					r = reverseEval(r / 255, (props.value as MalVal[])[1]) as number
					g = reverseEval(g / 255, (props.value as MalVal[])[2]) as number
					b = reverseEval(b / 255, (props.value as MalVal[])[3]) as number
					;(value as MalVal[])[1] = r
					;(value as MalVal[])[2] = g
					;(value as MalVal[])[3] = b
					break
				}
				case 'HSL': {
					let {h, s, l} = color.hsl
					h = reverseEval(
						(h / 180) * Math.PI,
						(props.value as MalVal[])[1]
					) as number
					s = reverseEval(s, (props.value as MalVal[])[2]) as number
					l = reverseEval(l, (props.value as MalVal[])[3]) as number
					;(value as MalVal[])[1] = h
					;(value as MalVal[])[2] = s
					;(value as MalVal[])[3] = l
					break
				}
				case 'EXP': {
					// Inverse evaluation
					value = reverseEval(color.hex8, props.value)
					break
				}
			}

			if (mode.value === 'RGB' || mode.value === 'HSL') {
				if (color.a < 0.9999) {
					const a =
						(props.value as MalVal[])[4] !== undefined
							? reverseEval(color.a, (props.value as MalVal[])[4])
							: color.a
					;(value as MalVal[])[4] = a
				} else {
					value = L(...(value as MalVal[]).slice(0, 4))
				}
			}

			context.emit('input', value)
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
		margin-right 0.5rem

	&__hex
		margin-left 0.3rem
		color var(--comment)
		font-monospace()

	&__mode
		margin-right $input-horiz-margin
		width 3.7em
		border-bottom-color transparent
		color var(--comment)
		font-monospace()

	&__text
		width 6rem
		font-monospace()

	&__elements
		display flex

	&__el
		margin-right 0.2em
		width 3.3em

		&:last-child
			margin-right 0.3em

	&__exp
		margin-left 0.3rem
</style>
