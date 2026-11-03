<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import { InputGroup } from 'tweeq/InputGroup'

import AstValue from './AstValue.vue'
import { slotMenuItems } from './menu'
import type { Slot } from './structure'

defineProps<{
	slots: readonly Slot[]
	parentPath: string
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

const emit = defineEmits<{ change: [parent: AST] }>()
</script>

<template>
	<!-- A few of them, side by side, on the row of what holds them. -->
	<InputGroup class="inline">
		<AstValue
			v-for="slot in slots"
			:key="slot.key"
			:entry="slot"
			:path="`${parentPath}/${slot.key}`"
			:menuItems="slotMenuItems(slot, parent => emit('change', parent))"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
		/>
	</InputGroup>
</template>

<style scoped>
.inline {
	min-width: 0;
}
.inline > * {
	flex: 1 1 0;
}
</style>
