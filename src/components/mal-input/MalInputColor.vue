<template>
	<div class="MalInputColor">
		<InputColor
			class="MalInputColor__picker"
			v-if="mode"
			:value="pickerValue"
			:mode="mode"
			@input="onInputColor"
		/>
		<InputDropdown
			class="MalInputColor__mode"
			:value="mode"
			:values="['HEX', 'RGB', 'HSL']"
			@input="onInputMode"
		/>
		<div class="MalInputColor__text" v-if="mode === 'HEX'">
			<InputString :value="displayValues" @input="onInputText" />
		</div>
		<div class="MalInputColor__elements" v-else-if="mode">
			(
			<MalInputNumber
				v-for="(value, i) in displayValues"
				:key="i"
				class="MalInputColor__el"
				:value="value"
				:validator="validators[i]"
				@input="onInputNumber(i, $event)"
			/>)
		</div>
	</div>
</template>

<script lang="ts">
import chroma from 'chroma-js'
import {
	defineComponent,
	PropType,
	computed,
	ComputedRef
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
	cloneExp,
	malEquals
} from '@/mal/types'
import InputColor from '@/components/inputs/InputColor.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import MalInputNumber from './MalInputNumber.vue'
import {reverseEval} from '@/mal/utils'

type ColorMode = 'HEX' | 'RGB' | 'HSL'

export default defineComponent({
	components: {InputColor, InputString, InputDropdown, MalInputNumber},
	props: {
		value: {
			type: [String, Array] as PropType<MalVal>,
			required: true
		}
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
						if (['color/rgb', 'color/hsl'].includes(fst.value)) {
							return fst.value.split('/')[1].toUpperCase()
						} else if (['rgb', 'hsl'].includes(fst.value)) {
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

			if (typeof props.value === 'string') {
				return props.value
			} else if (isList(props.value)) {
				return props.value.slice(1)
			}
		})

		const pickerValue = computed(() => {
			if (!mode.value) return null

			let color: chroma.Color
			switch (mode.value) {
				case 'HEX':
					color = chroma.valid(props.value as string)
						? chroma(props.value as string)
						: chroma('black')
					break
				case 'RGB': {
					const [, r, g, b] = (props.value as MalVal[]).map(v =>
						getEvaluated(v)
					) as number[]
					color = chroma(r * 255, g * 255, b * 255, 'rgb')
					break
				}
				case 'HSL': {
					const evaluated = (props.value as MalVal[]).map(v =>
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

			if (isList(props.value) && props.value.length >= 5) {
				color = color.alpha(getEvaluated(props.value[4]) as number)
			}

			return color.css()
		})

		const validators = computed(() => {
			switch (mode.value) {
				case 'RGB':
					return [
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne
					]
				case 'HSL':
					return [
						validatorZeroTwoPI,
						validatorZeroOne,
						validatorZeroOne,
						validatorZeroOne
					]
			}

			return []
		})

		function onInputMode(mode: ColorMode) {
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
					value = L(S('hsl'), (h / 180) * Math.PI, s, l)
					break
				}
			}

			if (color.alpha() < 1 && mode !== 'HEX') {
				;(value as MalVal[]).push(color.alpha())
			}

			context.emit('input', value)
		}

		function onInputText(str: string) {
			context.emit('input', str)
		}

		function onInputNumber(i: number, v: number) {
			const newExp = L(...(props.value as MalVal[]))
			newExp[i + 1] = v
			context.emit('input', newExp)
		}

		function onInputColor(color: any) {
			let value: MalVal =
				typeof props.value === 'string' ? '' : L(...(props.value as MalVal[]))

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
					r = reverseEval(r / 255, (props.value as MalVal[])[1])
					g = reverseEval(g / 255, (props.value as MalVal[])[2])
					b = reverseEval(b / 255, (props.value as MalVal[])[3])
					;(value as MalVal[])[1] = r
					;(value as MalVal[])[2] = g
					;(value as MalVal[])[3] = b
					break
				}
				case 'HSL': {
					let {h, s, l} = color.hsl
					h = reverseEval((h / 180) * Math.PI, (props.value as MalVal[])[1])
					s = reverseEval(s, (props.value as MalVal[])[2])
					l = reverseEval(l, (props.value as MalVal[])[3])
					;(value as MalVal[])[1] = h
					;(value as MalVal[])[2] = s
					;(value as MalVal[])[3] = l
				}
			}

			if (mode.value !== 'HEX') {
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
			validators,
			pickerValue,
			onInputMode,
			onInputText,
			onInputNumber,
			onInputColor
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputColor
	display flex
	line-height $input-height

	&__picker
		margin-right 0.2em

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
			margin-right .3em
</style>
