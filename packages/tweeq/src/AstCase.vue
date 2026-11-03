<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { ParameterTreeItem } from 'tweeq/ParameterGrid'

import AstValue from './AstValue.vue'
import { slotMenuItems } from './menu'
import type { Slot } from './structure'

defineProps<{
	pattern: Slot
	result: Slot
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
	<!-- What a match looks for, and what it then comes to, read across one row. -->
	<ParameterTreeItem :label="pattern.label" icon="mdi:help-rhombus-outline">
		<div class="case">
			<AstValue
				v-for="(slot, i) in [pattern, result]"
				:key="slot.key"
				:style="{ order: i * 2 }"
				:entry="slot"
				:path="`${parentPath}/${slot.key}`"
				:menuItems="slotMenuItems(slot, parent => emit('change', parent))"
				:read="read"
				:show="show"
				@change="emit('change', $event)"
			/>
			<Icon class="arrow" icon="mdi:arrow-right-thin" />
		</div>
	</ParameterTreeItem>
</template>

<style scoped>
.case {
	display: flex;
	align-items: flex-start;
	gap: var(--tq-gap-group);
	min-width: 0;
}
.case > :not(.arrow) {
	flex: 1 1 0;
	min-width: 0;
}
.arrow {
	order: 1;
	flex-shrink: 0;
	width: var(--tq-icon-size);
	height: var(--tq-input-height);
	color: var(--tq-color-text-mute);
}
</style>
