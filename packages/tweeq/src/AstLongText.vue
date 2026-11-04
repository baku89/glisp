<script setup lang="ts">
import { InputButton } from 'tweeq/InputButton'
import { InputTextBase } from 'tweeq/InputTextBase'
import { Menu, type MenuItem } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { nextTick, ref, useTemplateRef } from 'vue'

/**
 * A string too long to read in a row, such as the data of a path. All there is of it here
 * is what it is. It opens to be read and written where it has the room, and that goes
 * away by being done with, as a menu does.
 */
const props = defineProps<{
	value: string
	label: string
	icon?: string
	menuItems?: MenuItem[]
	inlinePosition?: 'start' | 'middle' | 'end'
}>()

const emit = defineEmits<{ change: [value: string] }>()

const $root = useTemplateRef<HTMLElement>('$root')
const $text = useTemplateRef<{ select: (start?: number, end?: number) => void }>('$text')

const open = ref(false)
const draft = ref('')
let original = ''

async function show(): Promise<void> {
	if (open.value) return
	original = props.value
	draft.value = props.value
	open.value = true
	await nextTick()
	$text.value?.select(0, 0)
}

function write(value: string): void {
	draft.value = value
	emit('change', value)
}

const menuAt = ref<[number, number] | null>(null)

function openMenu(event: MouseEvent): void {
	if (!props.menuItems?.length) return
	event.preventDefault()
	event.stopPropagation()
	menuAt.value = [event.clientX, event.clientY]
}

// Esc is going back. Pressing anywhere else keeps what is written, which has shown already.
function onKey(event: KeyboardEvent): void {
	if (event.key === 'Escape' && props.value !== original) emit('change', original)
}
</script>

<template>
	<div ref="$root" class="AstLongText">
		<InputButton
			:icon="icon"
			:label="label"
			:inlinePosition="inlinePosition"
			subtle
			chevron
			@click="show"
			@contextmenu="openMenu"
		/>
		<Popover
			v-if="menuAt !== null"
			:reference="$root"
			:placement="menuAt"
			:open="true"
			teleport=".TqViewport"
			@update:open="$event || (menuAt = null)"
		>
			<Menu :items="menuItems ?? []" @close="menuAt = null" />
		</Popover>
		<Popover
			v-model:open="open"
			:reference="$root"
			placement="bottom-end"
			arrow
			teleport=".TqViewport"
		>
			<div class="AstLongTextEditor">
				<InputTextBase
					ref="$text"
					:modelValue="draft"
					multiline
					font="monospace"
					@update:modelValue="write"
					@confirm="open = false"
					@keydown="onKey"
				/>
			</div>
		</Popover>
	</div>
</template>

<style scoped>
.AstLongText {
	display: grid;
	min-width: 0;
}
.AstLongTextEditor {
	width: min(80ch, calc(100vw - 40px));
}
</style>
