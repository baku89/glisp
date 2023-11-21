<template>
	<GlispEditor
		class="ExprExpEditor"
		:value="code"
		:activeRange="activeRange"
		:cssStyle="cssStyle"
		:selection="selection"
		@input="onInput"
		@update:selection="onSelect"
	/>
</template>

<script lang="ts" setup>
import {computed, Ref, ref} from 'vue'

import GlispEditor from '@/components/GlispEditor'
import {
	BlankException,
	Expr,
	ExprColl,
	findExpByRange,
	getDelimiters,
	getRangeOfExpr,
	getType,
	isColl,
	isList,
	printer,
	printExpr,
	readStr,
	symbolFor,
} from '@/glisp'

type EditMode = 'node' | 'elements' | 'params'

interface Props {
	exp: Expr
	selectedExp: ExprColl | null
	editMode: EditMode
	cssStyle?: string
}

const props = withDefaults(defineProps<Props>(), {cssStyle: ''})

const emit = defineEmits<{
	'update:hasParseError': [boolean]
	select: [exp: ExprColl | null]
	'input-code': [code: string]
	input: [exp: Expr]
}>()

const EDITOR_DELIMITER = ';__\n'
const RE_EDITOR_DELIMITER = /;__\n/g
const selection = ref([0, 0]) as Ref<[number, number]>
let hasParseError = false

// Compute pre and post text
const preText = computed(() => {
	const exp = props.exp
	switch (props.editMode) {
		case 'node':
			return ''
		case 'params': {
			if (!isList(exp)) throw new Error('Invalid params')
			return '(' + getDelimiters(exp)[0] + printExpr(exp[0])
		}
		case 'elements': {
			switch (getType(exp)) {
				case 'list':
					return '('
				case 'vector':
					return '['
				case 'map':
					return '{'
				default:
					throw new Error('Invalid node')
			}
		}
	}

	throw new Error('Invalid editMode')
})

const postText = computed(() => {
	const exp = props.exp
	switch (props.editMode) {
		case 'node':
			return ''
		case 'params':
			return ')'
		case 'elements':
			switch (getType(exp)) {
				case 'list':
					return ')'
				case 'vector':
					return ']'
				case 'map':
					return '}'
				default:
					throw new Error('Invalid node')
			}
	}
	throw new Error('Invalid editMode')
})

const endsDelimiter = computed(() => {
	return props.editMode === 'params' ? EDITOR_DELIMITER : ''
})

// Exp -> Code Conversion
const code = computed(() => {
	const ret = printExpr(props.exp)

	switch (props.editMode) {
		case 'node':
			return ret
		case 'params': {
			return ret
				.replace(RE_EDITOR_DELIMITER, '')
				.slice(preText.value.length, -postText.value.length)
		}
		case 'elements':
			return ret.slice(1, -1)
	}

	throw new Error('Invalid editMode')
})

// selectedExp -> activeRange
const activeRange = computed(() => {
	const sel = props.selectedExp
	if (sel && isColl(sel) && isColl(props.exp)) {
		const ret = getRangeOfExpr(sel, props.exp)
		if (ret) {
			const [start, end] = ret
			return [
				start - preText.value.length - endsDelimiter.value.length,
				end - preText.value.length - endsDelimiter.value.length,
			] as const
		}
	}
	return null
})

// Event Handlers
let inputExp: Expr | null = null

function onInput(code: string) {
	emit('input-code', code)
	let exp

	try {
		exp = readStr(
			preText.value +
				endsDelimiter.value +
				code +
				endsDelimiter.value +
				postText.value
		)
	} catch (err) {
		if (!(err instanceof BlankException)) {
			printer.error(err)
		}
		hasParseError = true
		emit('update:hasParseError', hasParseError)
		emit('select', null)
		return
	}
	hasParseError = false
	emit('update:hasParseError', hasParseError)
	inputExp = exp
	emit('input', inputExp)
}

function onSelect([start, end]: [number, number], exp?: Expr) {
	selection.value = [start, end]

	if (exp === undefined) {
		if (inputExp) {
			exp = inputExp
			inputExp = null
		} else {
			exp = props.exp
		}
	}

	if (hasParseError || exp === undefined) {
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

	if (isList(selectedExp) && selectedExp[0] === symbolFor('sketch')) {
		emit('select', null)
	} else {
		emit('select', selectedExp)
	}
}
</script>
@/glis[/printer@/glis[/reader@/glis[/reader@/glis[/types
