<template>
	<teleport to="#PopoverWrapper">
		<div class="Popover" v-if="open" ref="target" :style="{top, left}">
			<slot />
		</div>
	</teleport>
</template>

<script lang="ts">
import {Placement} from '@popperjs/core'
import {onClickOutside, templateRef} from '@vueuse/core'
import {defineComponent, PropType, ref, watch} from 'vue'

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
		placement: {
			type: String as PropType<Placement>,
			default: 'top',
		},
	},
	setup(props, context) {
		if (!document.querySelector('body > #PopoverWrapper')) {
			const dest = document.createElement('div')
			dest.id = 'PopoverWrapper'
			document.body.appendChild(dest)
		}

		const targetEl = templateRef('target')

		const top = ref('100px'),
			left = ref('0')

		function updatePosition() {
			if (!props.reference || !targetEl.value) return

			const rb = props.reference.getBoundingClientRect()
			const vw = window.innerWidth,
				vh = window.innerHeight
			const tb = targetEl.value

			left.value = rb.right + 'px'
			top.value = rb.y + 'px'
		}

		watch(
			() => props.open,
			open => {
				if (open) {
					if (!targetEl.value || !props.reference) {
						return
					}

					updatePosition()
					window.addEventListener('resize', updatePosition)
					window.addEventListener('scroll', updatePosition)

					const cancel = onClickOutside(targetEl, () => {
						context.emit('update:open', false)
						cancel && cancel()
					})
				} else {
					window.removeEventListener('resize', updatePosition)
					window.removeEventListener('scroll', updatePosition)
				}
			},
			{flush: 'post'}
		)

		return {left, top}
	},
})
</script>

<style lang="stylus">
#PopoverWrapper
	position fixed
	top 0
	z-index 100

.Popover
	position absolute
</style>
