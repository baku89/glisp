<script setup lang="ts">
import { InputTextBase } from 'tweeq/InputTextBase'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'

/** What a row is called, which a click starts writing over if it is a name to change. */
const props = defineProps<{
	row: string
	label: string
	/** The name as it is written, for a row that has one. */
	source: string | null
	can: (row: string, name: string) => boolean
}>()

const emit = defineEmits<{ rename: [row: string, name: string] }>()

const editing = ref(false)
const draft = ref('')
const isFine = computed(() => draft.value === props.source || props.can(props.row, draft.value))
const $input = useTemplateRef<{ select: () => void }>('$input')

async function start(): Promise<void> {
	if (props.source === null) return
	draft.value = props.source
	editing.value = true
	await nextTick()
	$input.value?.select()
}

function confirm(): void {
	if (!editing.value) return
	editing.value = false
	if (draft.value !== props.source && props.can(props.row, draft.value)) {
		emit('rename', props.row, draft.value)
	}
}

// A click elsewhere can select something else before this has lost its focus.
onBeforeUnmount(confirm)

function onKey(event: KeyboardEvent): void {
	if (event.key !== 'Escape') return
	event.stopPropagation()
	editing.value = false
}
</script>

<template>
	<InputTextBase
		v-if="editing"
		ref="$input"
		v-model="draft"
		class="RowName editing"
		theme="underline"
		:invalid="!isFine"
		@confirm="confirm"
		@blur="confirm"
		@keydown="onKey"
	/>
	<span v-else class="RowName" :class="{ renamable: source !== null }" @click="start">{{ label }}</span>
</template>

<style scoped>
.RowName {
	overflow: hidden;
	font-weight: 600;
	text-overflow: ellipsis;
}
.RowName.renamable {
	cursor: text;
}
.RowName.renamable:hover {
	text-decoration: underline;
	text-decoration-color: var(--tq-color-border);
	text-underline-offset: 2px;
}
.RowName.editing {
	flex: 1 1 0;
	min-width: 0;
}
</style>
