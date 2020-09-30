<template>
	<GlispEditor
		class="MalExpEditor"
		:value="code"
		:active-range="activeRange"
		:css-style="cssStyle"
		:selection="selection"
		@input="onInput"
		@update:selection="onSelect"
	/>
</template>

<script lang="ts">
import {defineComponent, computed, ref, PropType} from 'vue'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {BlankException} from '@/mal/reader'
import printExp, {printer} from '@/mal/printer'
import {
	MalVal,
	MalColl,
	MalSymbol,
	isMalColl,
	MalList,
	MalType,
} from '@/mal/types'

import GlispEditor from '@/components/GlispEditor'

enum EditMode {
	Node = 'node',
	Elements = 'elements',
	Params = 'params',
}

const EDITOR_DELIMITER = ';__\n'
const RE_EDITOR_DELIMITER = /;__\n/g

export default defineComponent({
	name: 'MalExpEditor',
	components: {
		GlispEditor,
	},
	props: {
		exp: {
			type: Object as PropType<MalVal>,
			required: true,
		},
		selectedExp: {
			type: Object as PropType<MalColl | undefined>,
			default: undefined,
		},
		cssStyle: {
			type: String,
			default: '',
		},
		editMode: {
			type: String as PropType<EditMode>,
			default: EditMode.Params,
		},
	},
	setup(props, context) {
		const selection = ref<[number, number]>([0, 0])
		const hasParseError = ref(false)

		// Compute pre and post text
		const preText = computed(() => {
			const exp = props.exp as MalVal
			switch (props.editMode) {
				case EditMode.Node:
					return ''
				case EditMode.Params: {
					return (
						'(' +
						(exp as MalColl).delimiters[0] +
						(exp as MalColl)[M_ELMSTRS][0]
					)
				}
				case EditMode.Elements: {
					switch (exp.type) {
						case MalType.List:
							return '('
						case MalType.Vector:
							return '['
						case MalType.Map:
							return '{'
						default:
							throw new Error('Invalid node')
					}
				}
			}
		})

		const postText = computed(() => {
			const exp = props.exp
			switch (props.editMode) {
				case EditMode.Node:
					return ''
				case EditMode.Params:
					return ')'
				case EditMode.Elements:
					switch (exp.type) {
						case MalType.List:
							return ')'
						case MalType.Vector:
							return ']'
						case MalType.Map:
							return '}'
						default:
							throw new Error('Invalid node')
					}
			}
		})

		const endsDelimiter = computed(() => {
			return props.editMode === EditMode.Params ? EDITOR_DELIMITER : ''
		})

		// Exp -> Code Conversion
		const code = computed(() => {
			const exp = props.exp as MalVal
			const ret = printExp(exp)

			switch (props.editMode) {
				case EditMode.Node:
					return ret
				case EditMode.Params: {
					return ret
						.replace(RE_EDITOR_DELIMITER, '')
						.slice(preText.value.length, -postText.value.length)
				}
				case EditMode.Elements:
					return ret.slice(1, -1)
			}
		})

		// selectedExp -> activeRange
		const activeRange = computed(() => {
			const sel = props.selectedExp
			if (sel && isMalColl(sel) && isMalColl(props.exp)) {
				const ret = getRangeOfExp(sel, props.exp)
				if (ret) {
					const [start, end] = ret
					return [
						start - preText.value.length - endsDelimiter.value.length,
						end - preText.value.length - endsDelimiter.value.length,
					]
				}
			}
			return null
		})

		// Event Handlers
		let inputExp: MalVal | null = null

		function onInput(code: string) {
			context.emit('input-code', code)
			let exp

			try {
				exp = readStr(
					`${preText.value}${endsDelimiter.value}${code}${endsDelimiter.value}${postText.value}`,
					true
				)
			} catch (err) {
				if (!(err instanceof BlankException)) {
					printer.error(err)
				}
				hasParseError.value = true
				context.emit('update:hasParseError', hasParseError)
				context.emit('select', null)
				return
			}
			hasParseError.value = false
			context.emit('update:hasParseError', hasParseError)
			inputExp = exp
			context.emit('input', inputExp)
		}

		function onSelect([start, end]: [number, number], exp?: MalVal) {
			selection.value = [start, end]

			if (exp === undefined) {
				if (inputExp) {
					exp = inputExp
					inputExp = null
				} else {
					exp = props.exp
				}
			}

			if (hasParseError.value || exp === undefined) {
				return
			}

			const selectedExp = findExpByRange(
				exp,
				start + preText.value.length + endsDelimiter.value.length,
				end + preText.value.length + endsDelimiter.value.length
			)

			const isSame = props.selectedExp === selectedExp

			if (isSame) {
				return
			}

			if (
				MalList.is(selectedExp) &&
				selectedExp[0] === MalSymbol.create('sketch')
			) {
				context.emit('select', null)
			} else {
				context.emit('select', selectedExp)
			}
		}

		return {
			preText,
			postText,
			code,
			selection,
			activeRange,
			onInput,
			onSelect,
		}
	},
})
</script>
