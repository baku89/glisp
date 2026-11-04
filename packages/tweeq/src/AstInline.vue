<script setup lang="ts">
import { type AST, type Diagnostic, type Env, MetaAST } from '@glisp/lang'
import { InputGroup } from 'tweeq/InputGroup'
import type { MenuItem } from 'tweeq/Menu'
import { inject } from 'vue'

import AstValue from './AstValue.vue'
import { referenceMenuItems, slotMenuItems, withCopyItems } from './menu'
import { COMMANDS_FOR, LINKER } from './selection'
import type { Slot } from './structure'

const props = defineProps<{
	slots: readonly Slot[]
	parentPath: string
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

const emit = defineEmits<{ change: [parent: AST] }>()

const linker = inject(LINKER, null)
const commandsFor = inject(COMMANDS_FOR, undefined)

/** Each of them can be referred to, and made to refer, as a row of its own could. */
const menuOf = (slot: Slot): MenuItem[] =>
	withCopyItems(
		slotMenuItems(
			slot,
			parent => emit('change', parent),
			commandsFor?.(`${props.parentPath}/${slot.key}`)
		),
		linker === null
			? []
			: referenceMenuItems(linker, `${props.parentPath}/${slot.key}`, code =>
					emit('change', slot.replace(slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, code) : code))
				)
	)
</script>

<template>
	<!-- A few of them, side by side, on the row of what holds them. -->
	<InputGroup class="inline">
		<AstValue
			v-for="slot in slots"
			:key="slot.key"
			:entry="slot"
			:path="`${parentPath}/${slot.key}`"
			:menuItems="menuOf(slot)"
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
