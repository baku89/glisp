<template>
	<teleport to="body">
		<div class="Popover" v-if="open">
			<div class="Popover__popover" ref="targetEl">
				<slot />
			</div>
		</div>
	</teleport>
</template>

<script lang="ts">
import {createPopper, Instance as PopperInstance, popper} from '@popperjs/core'
import {
	defineComponent,
	nextTick,
	onMounted,
	onUnmounted,
	PropType,
	reactive,
	ref,
	toRefs,
	watch,
} from 'vue'

export default defineComponent({
	name: 'Popover',
	props: {
		reference: {
			type: Element,
		},
		open: {
			type: Boolean,
			required: true,
		},
	},
	setup(props, context) {
		const targetEl = ref<null | HTMLElement>(null)

		let popperInstance: PopperInstance | undefined

		watch(
			() => [targetEl.value, props.reference],
			() => {
				if (!targetEl.value || !props.reference) return

				popperInstance = createPopper(props.reference, targetEl.value, {
					placement: 'top',
				})
			}
		)

		watch(
			() => props.open,
			() => {
				if (!props.open && popperInstance) {
					popperInstance.destroy()
					popperInstance = undefined
				}
			}
		)

		onUnmounted(() => {
			popperInstance?.destroy()
		})

		return {
			targetEl,
		}
	},
})
</script>

<style lang="stylus"></style>
