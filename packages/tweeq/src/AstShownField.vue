<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { InputTextBase } from 'tweeq/InputTextBase'
import { Menu, type MenuItem, type MenuItems, menuItemsOf } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { useMultiSelectStore } from 'tweeq/stores/multiSelect'
import type { InputAlign, InputFont, InputPosition } from 'tweeq/types'
import { useModifierKeys } from 'tweeq/use/useModifierKeys'
import { ref, toRef, useTemplateRef } from 'vue'

import type { Place } from './multiRows'

const props = defineProps<{
	/** How it is written. */
	source: string
	place: Place
	/** Being pressed is to go into what is written, rather than only to select it. */
	pressEdits?: boolean
	leftIcon?: string
	align?: InputAlign
	font?: InputFont
	inlinePosition?: InputPosition
	menuItems?: MenuItems
}>()

const emit = defineEmits<{
	/** To go into what is written. */
	edit: []
	/** Pressed, with nothing to say that it is being selected along with others. */
	press: [event: MouseEvent]
}>()

const $input = useTemplateRef('$input')
const focused = ref(false)

// What is written is known to the program and not to the input, so it has nothing to carry along.
const multi = useMultiSelectStore().register({
	type: 'opaque',
	el: $input,
	focusing: focused,
	data: toRef(() => props.place),
	getValue: () => '',
	setValue: () => {},
	confirm: () => {},
})

const { meta, control, shift } = useModifierKeys()

const selecting = (): boolean => meta.value || control.value || shift.value

function onFocus(): void {
	if (props.pressEdits && !selecting()) emit('edit')
}

// Its input takes no pointer, so being pressed does not give it the focus that selects it.
function onClick(event: MouseEvent): void {
	if (selecting()) ($input.value as { select?: (start: number, end: number) => void } | null)?.select?.(0, 0)
	if (!selecting()) emit('press', event)
}

// Pressed only to be selected, it is a button, as one that a value is dragged from is: there
// is nothing in it to type in, and its focus is only for being selected along with others.
const $button = useTemplateRef<HTMLElement>('$button')
const menuAt = ref<[number, number] | null>(null)
// What the menu has in it, made once it is opened rather than each time this is drawn.
const shownItems = ref<MenuItem[]>([])
function onButtonMenu(event: MouseEvent): void {
	const items = menuItemsOf(props.menuItems)
	if (items.length === 0) return
	shownItems.value = items
	event.preventDefault()
	menuAt.value = [event.clientX, event.clientY]
}
function onButtonClick(event: MouseEvent): void {
	if (!selecting()) emit('press', event)
}
</script>

<template>
	<div
		v-if="!pressEdits"
		ref="$input"
		class="AstShownButton"
		:class="{ active: multi.subfocus }"
		role="button"
		tabindex="0"
		:inline-position="inlinePosition"
		@focus="focused = true"
		@blur="focused = false"
		@click="onButtonClick"
		@dblclick="emit('edit')"
		@contextmenu="onButtonMenu"
	>
		<Icon v-if="leftIcon" class="icon" :icon="leftIcon" />
		<span ref="$button" class="label"><slot /></span>
		<Popover
			v-if="menuAt !== null"
			:reference="$button"
			:placement="menuAt"
			:open="true"
			teleport=".TqViewport"
			@update:open="menuAt = $event ? menuAt : null"
		>
			<Menu :items="shownItems" @close="menuAt = null" />
		</Popover>
	</div>
	<InputTextBase
		v-else
		ref="$input"
		v-model:focused="focused"
		:modelValue="source"
		:active="multi.subfocus"
		:font="font"
		:leftIcon="leftIcon"
		:align="align"
		:inlinePosition="inlinePosition"
		ignoreInput
		:menuItems="menuItems"
		@beforeinput.capture.prevent
		@click="onClick"
		@dblclick="emit('edit')"
		@focus="onFocus"
	>
		<template #inactiveContent>
			<slot />
		</template>
	</InputTextBase>
</template>

<style scoped>
.AstShownButton {
	position: relative;
	display: flex;
	gap: 4px;
	align-items: center;
	min-width: 0;
	height: var(--tq-input-height);
	padding: 0 6px;
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-input);
	color: var(--tq-color-text);
	cursor: pointer;
	outline: none;
	user-select: none;
}
.AstShownButton:hover {
	background: var(--tq-color-input-hover);
}
/* Selected, as an input with focus is, whether by being pressed or along with others. */
.AstShownButton:focus,
.AstShownButton.active {
	z-index: 1;
	box-shadow: 0 0 0 1px var(--tq-color-accent);
}
.AstShownButton[inline-position='start'] {
	border-start-end-radius: 0;
	border-end-end-radius: 0;
}
.AstShownButton[inline-position='middle'] {
	border-radius: 0;
}
.AstShownButton[inline-position='end'] {
	border-start-start-radius: 0;
	border-end-start-radius: 0;
}
.icon {
	flex: none;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
	color: currentColor;
	opacity: 0.8;
}
.label {
	display: grid;
	position: relative;
	flex: 1;
	min-width: 0;
}
</style>
