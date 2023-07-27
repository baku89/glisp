<template>
	<Popover v-model:open="opened" :placement="placement" closeTrigger="outside">
		<Menu :menu="menu" @action="opened = false" />
	</Popover>
</template>

<script lang="ts">
import {unrefElement} from '@vueuse/core'
import {defineComponent, onUnmounted, PropType, ref, watch} from 'vue'

import Menu, {MenuItem} from './Menu.vue'
import Popover from './Popover.vue'

export default defineComponent({
	name: 'ContextMenu',
	components: {Menu, Popover},
	props: {
		reference: {
			type: Element,
		},
		menu: {
			type: Array as PropType<MenuItem[]>,
			required: true,
		},
	},
	setup(props) {
		const placement = ref([0, 0] as [number, number])

		const opened = ref(false)

		watch(
			() => props.reference,
			(_el, _prevEl) => {
				const el = unrefElement(_el) as HTMLElement | undefined
				const prevEl = unrefElement(_prevEl) as HTMLElement | undefined

				if (el) el.addEventListener('contextmenu', onClick)
				if (prevEl) prevEl.removeEventListener('contextmenu', onClick)
			},
			{immediate: true, flush: 'post'}
		)

		onUnmounted(() => {
			const el = unrefElement(props.reference) as HTMLElement | undefined
			el?.removeEventListener('contextmenu', onClick)
		})

		function onClick(e: MouseEvent) {
			e.preventDefault()

			placement.value = [e.clientX, e.clientY]
			opened.value = true
		}

		return {opened, placement}
	},
})
</script>
