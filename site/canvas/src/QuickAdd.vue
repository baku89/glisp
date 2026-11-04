<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { Icon } from 'tweeq/Icon'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'

import { matching } from './quickAdd'

export interface QuickAddItem {
	readonly id: string
	readonly name: string
	readonly label: string
	readonly group: string
	readonly quiet?: boolean
	readonly icon: string
	perform(): void
}

const props = defineProps<{
	items: readonly QuickAddItem[]
	/** Where it comes up, on screen. */
	at: readonly [number, number]
	placeholder: string
}>()

const emit = defineEmits<{ close: [] }>()

const WIDTH = 260
const HEIGHT = 340
const MARGIN = 8

const $root = useTemplateRef<HTMLElement>('$root')
const $input = useTemplateRef<HTMLInputElement>('$input')
const query = ref('')
const current = ref(0)

const shown = computed(() => matching(props.items, query.value))
watch(query, () => (current.value = 0))

/** All of it stays on the window, however near an edge it was asked for. */
const place = computed(() => {
	const [x, y] = props.at
	return {
		left: `${Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN))}px`,
		top: `${Math.max(MARGIN, Math.min(y, window.innerHeight - HEIGHT - MARGIN))}px`,
		width: `${WIDTH}px`,
		maxHeight: `${HEIGHT}px`,
	}
})

onMounted(() => {
	$root.value?.showPopover?.()
	$input.value?.focus()
})

function choose(item: QuickAddItem | undefined): void {
	if (item === undefined) return
	emit('close')
	item.perform()
}

function move(by: number): void {
	const count = shown.value.length
	if (count === 0) return
	current.value = (current.value + by + count) % count
	void nextTick(() => {
		$root.value?.querySelector('.item.current')?.scrollIntoView({ block: 'nearest' })
	})
}

function onKey(event: KeyboardEvent): void {
	if (event.isComposing) return
	const by = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey) ? 1 : event.key === 'ArrowUp' || event.key === 'Tab' ? -1 : 0
	if (by !== 0) move(by)
	else if (event.key === 'Enter') choose(shown.value[current.value])
	else if (event.key === 'Escape') emit('close')
	else return
	event.preventDefault()
	event.stopPropagation()
}

// Anywhere else is leaving it.
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		if (!$root.value?.contains(event.target as Node)) emit('close')
	},
	{ capture: true }
)

/** Whether it comes at the start of its group, with nothing asked, for that to say so. */
const startsGroup = (i: number): boolean =>
	query.value.trim() === '' && shown.value[i]!.group !== shown.value[i - 1]?.group
</script>

<template>
	<div ref="$root" class="QuickAdd" popover="manual" :style="place" @keydown="onKey">
		<input
			ref="$input"
			v-model="query"
			class="search"
			:placeholder="placeholder"
			spellcheck="false"
			autocomplete="off"
		/>
		<div class="items">
			<template v-for="(item, i) in shown" :key="item.id">
				<div v-if="startsGroup(i)" class="group">{{ item.group }}</div>
				<button
					class="item"
					:class="{ current: i === current }"
					type="button"
					tabindex="-1"
					@pointerenter="current = i"
					@click="choose(item)"
				>
					<Icon class="icon" :icon="item.icon" />
					<span class="label">{{ item.label }}</span>
					<span class="name">{{ item.name }}</span>
				</button>
			</template>
			<p v-if="shown.length === 0" class="none">Nothing like that</p>
		</div>
	</div>
</template>

<style scoped>
.QuickAdd {
	position: fixed;
	inset: unset;
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 0;
	overflow: hidden;
	border: 1px solid var(--tq-color-border);
	border-radius: var(--tq-radius-pane);
	background: var(--tq-color-background);
	box-shadow: var(--tq-shadow-popup);
	color: var(--tq-color-text);
	font-size: 12px;
}
.search {
	flex: none;
	width: 100%;
	height: 32px;
	padding: 0 10px;
	border: none;
	border-bottom: 1px solid var(--tq-color-border);
	outline: none;
	background: transparent;
	color: inherit;
	font: inherit;
}
.items {
	flex: 1;
	min-height: 0;
	padding: 4px;
	overflow-y: auto;
}
.group {
	padding: 8px 6px 3px;
	color: var(--tq-color-text-mute);
	font-size: 10px;
}
.item {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	height: 24px;
	padding: 0 6px;
	border-radius: var(--tq-radius-input);
	color: inherit;
	text-align: left;
}
.item.current {
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent, #fff);
}
.icon {
	flex: none;
	width: 14px;
	height: 14px;
}
.label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.name {
	flex: none;
	margin-left: auto;
	opacity: 0.5;
	font-size: 10px;
}
.none {
	padding: 8px 6px;
	color: var(--tq-color-text-mute);
}
</style>
