<template>
	<Editor
		class="ExpEditor"
		:value="code"
		:activeRange="activeRange"
		:dark="dark"
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
	Ref,
	PropType
} from '@vue/composition-api'
import ConsoleScope from '@/scopes/console'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {nonReactive, NonReactive} from '@/utils'
import {BlankException} from '@/mal/reader'
import printExp, {printer} from '@/mal/printer'
import {MalVal, MalNode, symbolFor, isMalNode} from '@/mal/types'

import Editor from './Editor'

const OFFSET = 8 // length of "(sketch "

export default defineComponent({
	components: {
		Editor
	},
	props: {
		exp: {
			type: Object as PropType<NonReactive<MalNode> | null>,
			required: true
		},
		selectedExp: {
			type: Object as PropType<NonReactive<MalNode> | null>,
			required: true
		},
		dark: {
			type: Boolean,
			required: false
		},
		cssStyle: {
			type: String,
			default: ''
		}
	},
	setup(props, context: SetupContext) {
		const selection = ref([0, 0]) as Ref<[number, number]>
		const hasParseError = ref(false)

		// Exp -> Code Conversion
		const code = computed(() => {
			if (props.exp) {
				return printExp(props.exp.value as MalVal).slice(OFFSET, -5)
			} else {
				return ''
			}
		})

		// selectedExp -> activeRange
		const activeRange = computed(() => {
			const sel = props.selectedExp
			if (sel && isMalNode(sel.value)) {
				const ret = getRangeOfExp(sel.value)
				if (ret) {
					const [start, end] = ret
					return [start - OFFSET, end - OFFSET]
				}
			}
			return null
		})

		// Event Handlers
		let inputExp: NonReactive<MalVal> | null = null

		function onInput(code: string) {
			ConsoleScope.def('*sketch*', code)
			let exp
			try {
				exp = readStr(`(sketch ${code}\nnil)`, true)
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

			const selectedExp = findExpByRange(exp, start + OFFSET, end + OFFSET)

			const isSame = props.selectedExp?.value === selectedExp

			if (isSame) {
				return
			}

			if (
				Array.isArray(selectedExp) &&
				selectedExp[0] === symbolFor('sketch')
			) {
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
