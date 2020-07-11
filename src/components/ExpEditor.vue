<template>
	<Editor
		class="ExpEditor"
		:value="code"
		:activeRange="activeRange"
		:cssStyle="cssStyle"
		:selection="selection"
		@input="onInput"
		@update:selection="onSelect"
	/>
</template>

<script lang="ts">
import {
	defineComponent,
	computed,
	ref,
	SetupContext,
	Ref
} from '@vue/composition-api'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {nonReactive, NonReactive} from '@/utils'
import {BlankException} from '@/mal/reader'
import printExp, {printer} from '@/mal/printer'
import {
	MalVal,
	MalNode,
	symbolFor,
	isNode,
	isList,
	M_DELIMITERS,
	M_ELMSTRS,
	getType,
	MalType
} from '@/mal/types'

import Editor from './Editor'

const EditMode = {
	Node: 'node',
	Elements: 'elements',
	Params: 'params'
} as const
type EditMode = typeof EditMode[keyof typeof EditMode]

interface Props {
	exp: NonReactive<MalVal>
	selectedExp: NonReactive<MalNode> | null
	cssStyle: string
	editMode: EditMode
}

const EDITOR_DELIMITER = ';__\n'
const RE_EDITOR_DELIMITER = /;__\n/g

export default defineComponent({
	components: {
		Editor
	},
	props: {
		exp: {
			required: true
		},
		selectedExp: {
			required: true
		},
		cssStyle: {
			type: String,
			default: ''
		},
		editMode: {
			type: String,
			default: EditMode.Params
		}
	},
	setup(props: Props, context: SetupContext) {
		const selection = ref([0, 0]) as Ref<[number, number]>
		const hasParseError = ref(false)

		// Compute pre and post text
		const preText = computed(() => {
			const exp = props.exp.value as MalVal
			switch (props.editMode) {
				case EditMode.Node:
					return ''
				case EditMode.Params: {
					return (
						'(' +
						(exp as MalNode)[M_DELIMITERS][0] +
						(exp as MalNode)[M_ELMSTRS][0]
					)
				}
				case EditMode.Elements: {
					switch (getType(exp)) {
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
			const exp = props.exp.value
			switch (props.editMode) {
				case EditMode.Node:
					return ''
				case EditMode.Params:
					return ')'
				case EditMode.Elements:
					switch (getType(exp)) {
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
			const exp = props.exp.value as MalVal
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
			if (sel && isNode(sel.value) && isNode(props.exp.value)) {
				const ret = getRangeOfExp(sel.value, props.exp.value)
				if (ret) {
					const [start, end] = ret
					return [
						start - preText.value.length - endsDelimiter.value.length,
						end - preText.value.length - endsDelimiter.value.length
					]
				}
			}
			return null
		})

		// Event Handlers
		let inputExp: NonReactive<MalVal> | null = null

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
			inputExp = nonReactive(exp)
			context.emit('input', inputExp)
		}

		function onSelect([start, end]: [number, number], exp?: MalVal) {
			selection.value = [start, end]

			if (exp === undefined) {
				if (inputExp) {
					exp = inputExp.value
					inputExp = null
				} else {
					exp = props.exp.value
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

			const isSame = props.selectedExp?.value === selectedExp

			if (isSame) {
				return
			}

			if (isList(selectedExp) && selectedExp[0] === symbolFor('sketch')) {
				context.emit('select', null)
			} else {
				context.emit('select', nonReactive(selectedExp))
			}
		}

		return {
			preText,
			postText,
			code,
			selection,
			activeRange,
			onInput,
			onSelect
		}
	}
})
</script>
