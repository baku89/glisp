<template>
	<Editor
		class="ExpEditor"
		:value="code"
		:activeRange="activeRange"
		:dark="dark"
		:cssStyle="cssStyle"
		:selection.sync="selection"
		@input="onInput"
		@select="onSelect"
	/>
</template>

<script lang="ts">
import {defineComponent, computed, ref} from '@vue/composition-api'
import ConsoleScope from '@/scopes/console'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {nonReactive, NonReactive} from '@/utils'
import {BlankException} from '@/mal/reader'
import printExp, {printer} from '@/mal/printer'
import {MalVal, MalNode, symbolFor, isMalNode} from '@/mal/types'

import Editor from './Editor'

const OFFSET = 8 // length of "(sketch "

interface Props {
	exp: NonReactive<MalNode> | null
	selectedExp: NonReactive<MalNode> | null
	dark: boolean
	cssStyle: string
}

export default defineComponent({
	components: {
		Editor
	},
	props: {
		exp: {
			required: true,
			validator: p => p instanceof NonReactive || p === null
		},
		selectedExp: {
			required: true,
			validator: p => p instanceof NonReactive || p === null
		},
		dark: {
			type: Boolean,
			required: false
		},
		cssStyle: {
			default: ''
		}
	},
	setup(props: Props, context) {
		const selection = ref([0, 0])

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
				} else {
					return null
				}
			} else {
				return null
			}
		})

		// Event Handlers
		function onInput(code: string) {
			ConsoleScope.def('*sketch*', code)
			const evalCode = `(sketch ${code}\nnil)`
			let exp
			try {
				exp = nonReactive(readStr(evalCode, true))
			} catch (err) {
				if (!(err instanceof BlankException)) {
					printer.error(err)
				}
				context.emit('update:hasParseError', true)
				return
			}
			context.emit('update:hasParseError', false)
			console.log('editor onInput')
			context.emit('input', exp)
		}

		function onSelect([start, end]: [number, number]) {
			if (!props.exp) {
				return
			}

			console.log('editor onSelect')

			const selectedExp = findExpByRange(
				props.exp.value,
				start + OFFSET,
				end + OFFSET
			)

			// const isSame = props.selectedExp?.value === selectedExp

			// if (isSame) {
			// 	return
			// }

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
