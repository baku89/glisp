<script setup lang="ts">
import { InputTextBase } from 'tweeq/InputTextBase'
import type { MenuItem } from 'tweeq/Menu'
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
	/**
	 * What it says while it is selected, if pressing it only selects it: what it shows, rather
	 * than how it is written, which is gone into on purpose.
	 */
	selectedText?: string
	leftIcon?: string
	align?: InputAlign
	font?: InputFont
	inlinePosition?: InputPosition
	menuItems?: MenuItem[]
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
	if (selecting() || !props.pressEdits) $input.value?.select(0, 0)
	if (!selecting()) emit('press', event)
}
</script>

<template>
	<InputTextBase
		ref="$input"
		v-model:focused="focused"
		:modelValue="pressEdits ? source : (selectedText ?? source)"
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
