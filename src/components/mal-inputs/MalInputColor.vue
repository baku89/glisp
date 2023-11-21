<template>
	<div class="MalInputColor">
		<InputColor
			v-if="mode"
			class="MalInputColor__picker"
			:value="pickerValue"
			:mode="mode"
			@input="onInputColor"
			@end-tweak="$emit('end-tweak')"
		/>
		<div v-if="compact" class="MalInputColor__hex">{{ hexValue }}</div>
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
				<div v-else-if="mode" class="MalInputColor__elements">
					<MalInputNumber
						v-for="(v, i) in displayValues"
						:key="i"
						:compact="true"
						class="MalInputColor__el"
						:value="v"
						:validator="validators[i]"
						@input="onInputNumber(i, $event)"
						@end-tweak="$emit('end-tweak')"
					/>
				</div>
			</template>
		</template>
	</div>
</template>

<script lang="ts" setup>
import chroma from 'chroma-js'
import {computed, ComputedRef} from 'vue'

import {InputColor, InputDropdown, InputString} from '@/components/inputs'
import {
	createList as L,
	getEvaluated,
	getType,
	isList,
	isSymbol,
	MalSeq,
	MalType,
	MalVal,
	symbolFor as S,
} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

import MalExpButton from './MalExpButton.vue'
import MalInputNumber from './MalInputNumber.vue'

type ColorMode = 'HEX' | 'RGB' | 'HSL' | 'EXP'

const COLOR_SPACE_FUNCTIONS = new Set(['color/rgb', 'color/hsl'])
const COLOR_SPACE_SHORTHANDS = new Set(['rgb', 'hsl'])

interface Props {
	value: string | MalSeq
	compact?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: MalVal]
	select: [value: MalVal]
	'end-tweak': []
}>()

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

	throw new Error('Invalid color value')
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
			value = L(S('rgb'), ...color.rgb().map(v => v / 255))
			break
		case 'HSL': {
			const [h, s, l] = color.hsl()
			value = L(S('hsl'), ((h || 0) / 180) * Math.PI, s, l)
			break
		}
		default:
			throw new Error('Invalid color mode')
	}

	if (color.alpha() < 1 && mode !== 'HEX') {
		;(value as MalVal[]).push(color.alpha())
	}

	emit('input', value)
}

function onInputText(str: string) {
	if (mode.value !== 'EXP') {
		emit('input', str)
	} else {
		// Inverse evaluation
		const newExp = reverseEval(str, props.value)
		emit('input', newExp)
	}
}

function onInputNumber(i: number, v: number) {
	const newExp = L(...(props.value as MalVal[]))
	newExp[i + 1] = v
	emit('input', newExp)
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

	emit('input', value)
}

function validatorZeroOne(x: number) {
	return Math.max(0, Math.min(x, 1))
}

function validatorZeroTwoPI(x: number) {
	return Math.max(0, Math.min(x, Math.PI * 2))
}
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
