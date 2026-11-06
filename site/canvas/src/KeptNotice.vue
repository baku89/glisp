<script lang="ts" setup>
/**
 * That what referred to something just taken away is now the value it had, said once at the
 * top, out of the way, and gone by itself: for it to be gone back on, if that is not what was
 * wanted, back to just before the deleting, whatever has been done since.
 */
import { Icon } from 'tweeq/Icon'
import { vTooltip } from 'tweeq/Tooltip'
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
	/** The names of what is now a value, or null for there to be nothing to say. */
	names: readonly string[] | null
}>()

const emit = defineEmits<{ revert: []; dismiss: [] }>()

/** Long enough to be read, and not so long that it is in the way of what comes next. */
const SHOWN_FOR = 6000

let timer: ReturnType<typeof setTimeout> | undefined
watch(
	() => props.names,
	names => {
		clearTimeout(timer)
		if (names !== null) timer = setTimeout(() => emit('dismiss'), SHOWN_FOR)
	}
)
onBeforeUnmount(() => clearTimeout(timer))

const listed = (names: readonly string[]): string =>
	names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
</script>

<template>
	<Transition name="kept">
		<div v-if="names !== null" class="KeptNotice" role="status">
			<Icon class="icon" icon="mdi:link-variant-off" />
			<span class="says">
				<b>{{ listed(names) }}</b>
				referred to what was deleted, and
				{{ names.length === 1 ? 'keeps the value it' : 'keep the values they' }} had.
			</span>
			<button
				v-tooltip="'Back to just before it was deleted. This can be undone.'"
				class="revert"
				type="button"
				@click="emit('revert')"
			>
				Revert
			</button>
			<button class="close" type="button" aria-label="Dismiss" @click="emit('dismiss')">
				<Icon icon="mdi:close" />
			</button>
		</div>
	</Transition>
</template>

<style scoped>
.KeptNotice {
	position: absolute;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 900;
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: calc(100% - 32px);
	padding: 6px 6px 6px 12px;
	border: 1px solid var(--tq-color-border);
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: var(--tq-shadow-popup);
}
.icon {
	flex: none;
	color: var(--tq-color-warning);
}
.says {
	min-width: 0;
}
.revert {
	flex: none;
	padding: 0 8px;
	height: var(--tq-input-height);
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-input);
	color: var(--tq-color-text);
}
.revert:hover {
	background: var(--tq-color-input-hover);
}
.close {
	flex: none;
	display: grid;
	place-items: center;
	width: var(--tq-input-height);
	height: var(--tq-input-height);
	color: var(--tq-color-text-mute);
}
.kept-enter-active,
.kept-leave-active {
	transition: opacity var(--tq-hover-transition-duration), transform var(--tq-hover-transition-duration);
}
.kept-enter-from,
.kept-leave-to {
	opacity: 0;
	transform: translate(-50%, -4px);
}
</style>
