<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isPinned, MetaAST } from '@glisp/lang'
import { InputGroup } from 'tweeq/InputGroup'
import type { MenuItem } from 'tweeq/Menu'
import { inject } from 'vue'

import AstValue from './AstValue.vue'
import { referenceMenuItems, slotMenuItems, withCopyItems } from './menu'
import { COMMANDS_FOR, LINKER } from './selection'
import type { NumbersFit, Slot } from './structure'

const props = defineProps<{
	slots: readonly Slot[]
	parentPath: string
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
	/** How they go, with less room than they would like. */
	fit?: NumbersFit
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
		linker === null || isPinned(slot.ast)
			? []
			: referenceMenuItems(linker, `${props.parentPath}/${slot.key}`, code =>
					emit('change', slot.replace(slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, code) : code))
				)
	)
</script>

<template>
	<!-- A few of them, side by side, on the row of what holds them. -->
	<InputGroup class="inline" :class="{ stacked: fit === 'stacked' }" :direction="fit === 'stacked' ? 'vertical' : 'horizontal'">
		<AstValue
			v-for="slot in slots"
			:key="slot.key"
			:entry="slot"
			:path="`${parentPath}/${slot.key}`"
			:menuItems="menuOf(slot)"
			:read="read"
			:show="show"
			:bare="fit !== undefined && fit !== 'side'"
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
.inline.stacked > * {
	flex: none;
}
</style>
