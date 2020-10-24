<template>
	<div class="Popover" v-if="open" ref="targetEl">
		<slot />
	</div>
</template>

<script lang="ts">
import {createPopper, Instance as PopperInstance} from '@popperjs/core'
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
import ClickOutside from 'vue-click-outside'

export default defineComponent({
	name: 'Popover',
	directives: {
		ClickOutside,
	},
	props: {
		reference: {
			type: Element,
		},
		open: {
			type: Boolean,
			required: true,
		},
		placement: {
			type: String as PropType<
				| 'auto'
				| 'auto-start'
				| 'auto-end'
				| 'top'
				| 'bottom'
				| 'right'
				| 'left'
				| 'top-start'
				| 'top-end'
				| 'bottom-start'
				| 'bottom-end'
				| 'right-start'
				| 'right-end'
				| 'left-start'
				| 'left-end'
			>,
			default: 'top',
		},
	},
	setup(props, context) {
		const targetEl = ref<null | HTMLElement>(null)

		let popperInstance: PopperInstance | undefined

		// // Create and destroy popper instance
		watch(
			() => props.open,
			() => {
				if (props.open) {
					nextTick(() => {
						if (!props.reference || !targetEl.value) {
							console.warn('Cannot create Popper instance')
							return
						}
						const reference = props.reference
						const target = targetEl.value

						popperInstance = createPopper(reference, target, {
							placement: props.placement,
						})

						function onMousedown(e: MouseEvent) {
							if (target !== e.target && !target.contains(e.target as Node)) {
								context.emit('update:open', false)
								window.removeEventListener('mousedown', onMousedown)
							}
						}

						window.addEventListener('mousedown', onMousedown)
					})
				} else {
					hide()
				}
			}
		)

		onUnmounted(hide)

		function hide() {
			popperInstance?.destroy()
			popperInstance = undefined
		}

		return {
			targetEl,
			hide,
		}
	},
})
</script>

<style lang="stylus"></style>
