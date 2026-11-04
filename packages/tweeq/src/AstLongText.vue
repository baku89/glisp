<script setup lang="ts">
import { InputButton } from 'tweeq/InputButton'
import { Menu, type MenuItem } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { ref, useTemplateRef, watch } from 'vue'

import CodePopover from './CodePopover.vue'
import { registerPathData } from './language'

/**
 * A string too long to read in a row, such as the data of a path. All there is of it
 * here is what it is. It opens to be written where it has the room, as an expression
 * is, except that what is written is the string itself.
 */
const props = defineProps<{
	value: string
	label: string
	icon?: string
	/** What it is written in, if anything is known of that. */
	language?: string
	menuItems?: MenuItem[]
	inlinePosition?: 'start' | 'middle' | 'end'
}>()

const emit = defineEmits<{ change: [value: string] }>()

registerPathData()

const $root = useTemplateRef<HTMLElement>('$root')

const open = ref(false)
const draft = ref('')
let original = ''

function toggle(): void {
	if (open.value) {
		open.value = false
		return
	}
	original = props.value
	draft.value = props.value
	open.value = true
}

// What is written shows as it is written.
watch(draft, value => {
	if (open.value && value !== props.value) emit('change', value)
})

function dismiss(): void {
	if (props.value !== original) emit('change', original)
	open.value = false
}

const menuAt = ref<[number, number] | null>(null)

function openMenu(event: MouseEvent): void {
	if (!props.menuItems?.length) return
	event.preventDefault()
	event.stopPropagation()
	menuAt.value = [event.clientX, event.clientY]
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
			@click="toggle"
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
		<CodePopover
			v-if="open"
			v-model="draft"
			:reference="$root"
			:opener="$root"
			:lang="language ?? 'plaintext'"
			@dismiss="dismiss"
			@finish="open = false"
		/>
	</div>
</template>

<style scoped>
.AstLongText {
	display: grid;
	min-width: 0;
}
</style>
