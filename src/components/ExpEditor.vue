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
import {MalVal, MalNode, symbolFor, isNode, isList} from '@/mal/types'

import Editor from './Editor'

interface Props {
	exp: NonReactive<MalNode> | null
	selectedExp: NonReactive<MalNode> | null
	cssStyle?: string
	preText: string
	postText: string
}

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
		preText: {
			type: String,
			default: ''
		},
		postText: {
			type: String,
			default: ''
		}
	},
	setup(props: Props, context: SetupContext) {
		const selection = ref([0, 0]) as Ref<[number, number]>
		const hasParseError = ref(false)

		// Exp -> Code Conversion
		const code = computed(() => {
			if (props.exp) {
				return printExp(props.exp.value as MalVal).slice(
					props.preText.length,
					-props.postText.length
				)
			} else {
				return ''
			}
		})

		// selectedExp -> activeRange
		const activeRange = computed(() => {
			const sel = props.selectedExp
			if (sel && isNode(sel.value)) {
				const ret = getRangeOfExp(sel.value)
				if (ret) {
					const [start, end] = ret
					return [start - props.preText.length, end - props.preText.length]
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
				exp = readStr(`${props.preText}${code}${props.postText}`, true)
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
					exp = props.exp?.value
				}
			}

			if (hasParseError.value || exp === undefined) {
				return
			}

			const selectedExp = findExpByRange(
				exp,
				start + props.preText.length,
				end + props.preText.length
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
			code,
			selection,
			activeRange,
			onInput,
			onSelect
		}
	}
})
</script>
