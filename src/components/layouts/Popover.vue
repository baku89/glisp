<template>
	<teleport to="#PopoverWrapper">
		<div
			class="Popover"
			ref="target"
			v-if="open"
			:style="{top: top + 'px', left: left + 'px'}"
		>
			<slot />
		</div>
	</teleport>
</template>

<script lang="ts">
import {onClickOutside, templateRef, unrefElement} from '@vueuse/core'
import _, {clamp} from 'lodash'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

import {isDecendantElementOf} from '@/lib/dom'

type PlacementDirection = 'top' | 'right' | 'bottom' | 'left'
type PlacementAlign = 'start' | 'end'
type Placement = PlacementDirection | `${PlacementDirection}-${PlacementAlign}`

export default defineComponent({
	name: 'Popover',
	props: {
		reference: {
			type: Element,
			required: false,
		},
		open: {
			type: Boolean,
			required: true,
		},
		placement: {
			type: [String, Array] as PropType<Placement | [number, number]>,
			default: 'bottom',
		},
		closeTrigger: {
			type: String as PropType<'outside' | 'outside-except-reference'>,
			default: 'outside-except-reference',
		},
	},
	setup(props, context) {
		if (!document.querySelector('body > #PopoverWrapper')) {
			const dest = document.createElement('div')
			dest.id = 'PopoverWrapper'
			document.body.appendChild(dest)
		}

		const refEl = computed<HTMLElement | null>(() =>
			unrefElement(props.reference)
		)

		const targetEl = templateRef('target')

		const top = ref(0),
			left = ref(0)

		function updatePosition() {
			if (!targetEl.value) return

			let {placement} = props

			const tb = targetEl.value.getBoundingClientRect(),
				vw = window.innerWidth,
				vh = window.innerHeight

			let x = 0,
				y = 0

			if (_.isString(placement)) {
				if (!refEl.value) throw new Error('Cannot align the popover')

				const rb = refEl.value.getBoundingClientRect()

				// Flip detection
				if (placement.startsWith('left')) {
					if (rb.x < tb.width && vw - rb.right > tb.width) {
						placement = placement.replace('left', 'right') as Placement
					}
				} else if (placement.startsWith('right')) {
					if (vw - rb.right < tb.width && rb.x > tb.width) {
						placement = placement.replace('right', 'left') as Placement
					}
				}

				if (placement.startsWith('top')) {
					if (rb.y < tb.height && vh - rb.bottom > tb.height) {
						placement = placement.replace('top', 'bottom') as Placement
					}
				} else if (placement.startsWith('bottom')) {
					if (vh - rb.bottom < tb.height && rb.y > tb.height) {
						placement = placement.replace('bottom', 'top') as Placement
					}
				}

				// X
				if (placement.startsWith('left')) {
					x = rb.x - tb.width
				} else if (placement.startsWith('right')) {
					x = rb.right
				} else if (/^(top|bottom)-start$/.test(placement)) {
					x = rb.x
				} else if (/^(top|bottom)$/.test(placement)) {
					x = rb.x - (tb.width - rb.width) / 2
				} else if (/^(top|bottom)-end$/.test(placement)) {
					x = rb.x - (rb.width - rb.width)
				}
				x = clamp(x, 0, vw - tb.width)

				// Y
				if (placement.startsWith('top')) {
					y = rb.y - tb.height
				} else if (placement.startsWith('bottom')) {
					y = rb.bottom
				} else if (/^(left|right)-start$/.test(placement)) {
					y = rb.y
				} else if (/^(left|right)$/.test(placement)) {
					y = rb.y - (tb.height - rb.height) / 2
				} else if (/^(left|right)-end$/.test(placement)) {
					y = rb.y - (rb.height - rb.height)
				}
				y = clamp(y, 0, vh - tb.height)
			} else {
				// Absolute positioning (i.e. context menu)
				x = placement[0]
				y = placement[1]
			}

			left.value = x
			top.value = y
		}

		watch(
			() => props.open,
			open => {
				if (open) {
					if (!targetEl.value) return

					updatePosition()
					window.addEventListener('resize', updatePosition)
					window.addEventListener('scroll', updatePosition)

					const cancel = onClickOutside(targetEl, e => {
						if (
							props.closeTrigger === 'outside-except-reference' &&
							e.target instanceof HTMLElement &&
							refEl.value &&
							isDecendantElementOf(e.target, refEl.value)
						) {
							return
						}

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

		return {left, top, refEl}
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
