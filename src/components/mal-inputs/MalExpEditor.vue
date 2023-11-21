<template>
	<GlispEditor
		class="MalExpEditor"
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
import printExp, {printer} from '@/mal/printer'
import readStr, {findExpByRange, getRangeOfExp} from '@/mal/reader'
import {BlankException} from '@/mal/reader'
import {
	getType,
	isList,
	isNode,
	M_DELIMITERS,
	M_ELMSTRS,
	MalNode,
	MalType,
	MalVal,
	symbolFor,
} from '@/mal/types'

type EditMode = 'node' | 'elements' | 'params'

interface Props {
	exp: MalVal
	selectedExp: MalNode | null
	editMode: EditMode
	cssStyle?: string
}

const props = withDefaults(defineProps<Props>(), {cssStyle: ''})

const emit = defineEmits<{
	'update:hasParseError': [boolean]
	select: [exp: MalNode | null]
	'input-code': [code: string]
	input: [exp: MalVal]
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
			return (
				'(' + (exp as MalNode)[M_DELIMITERS][0] + (exp as MalNode)[M_ELMSTRS][0]
			)
		}
		case 'elements': {
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
	throw new Error('Invalid editMode')
})

const endsDelimiter = computed(() => {
	return props.editMode === 'params' ? EDITOR_DELIMITER : ''
})

// Exp -> Code Conversion
const code = computed(() => {
	const ret = printExp(props.exp)

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
	if (sel && isNode(sel) && isNode(props.exp)) {
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
	emit('input-code', code)
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
