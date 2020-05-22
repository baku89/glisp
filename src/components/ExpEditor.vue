<template>
	<Editor
		class="ExpEditor"
		:value="code"
		:activeRange="activeRange"
		:dark="dark"
		:cssStyle="cssStyle"
		@input="onInput"
		@select="onSelection"
	/>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import ConsoleScope from '@/scopes/console'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {nonReactive, NonReactive} from '@/utils'
import {BlankException} from '@/mal/reader'
import printExp, {printer} from '@/mal/printer'
import {MalVal, MalNode, symbolFor, isMalNode} from '../mal/types'

const OFFSET = 8 // length of "(sketch "

export default defineComponent({
	props: {
		exp: {
			type: NonReactive,
			required: true
		},
		selectedExp: {
			type: Object,
			required: true
		},
		dark: {
			type: Boolean,
			required: false
		},
		evalExpIfNeeded: {
			type: Function,
			required: true
		},
		cssStyle: {
			default: ''
		}
	},
	setup(props, context) {
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
			if (isMalNode(sel)) {
				const ret = getRangeOfExp(sel)
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
				context.emit('update:hasError', true)
				return
			}
			context.emit('update:hasError', true)
			context.emit('input', exp)
		}

		function onSelect([start, end]: [number, number]) {
			props.evalExpIfNeeded()

			const selectedExp = findExpByRange(
				props.exp.value as MalNode,
				start + OFFSET,
				end + OFFSET
			)
			if (
				Array.isArray(selectedExp) &&
				selectedExp[0] === symbolFor('sketch')
			) {
				context.emit('select', null)
			} else {
				context.emit('select', selectedExp)
			}
		}

		return {
			code,
			activeRange,
			onInput,
			onSelect,

			dark: props.dark,
			cssStyle: props.cssStyle
		}
	}
})
</script>
