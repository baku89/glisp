import {onBeforeUnmount, Ref, reactive, onMounted} from '@vue/composition-api'

export function useDraggable(el: Ref<null | HTMLElement>) {
	const drag = reactive({
		x: 0,
		y: 0,
		deltaX: 0,
		deltaY: 0,
		isDragging: false,
		startX: 0,
		startY: 0
	})

	let prevX: number, prevY: number

	function onMousedrag(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.x = clientX - drag.startX
		drag.y = clientY - drag.startY
		drag.deltaX = clientX - prevX
		drag.deltaY = clientY - prevY
		prevX = clientX
		prevY = clientY
	}

	function onMouseup() {
		drag.isDragging = false
		drag.x = 0
		drag.y = 0
		drag.deltaX = 0
		drag.deltaY = 0
		drag.startX = 0
		drag.startY = 0
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	function onMousedown(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.isDragging = true
		drag.startX = clientX
		drag.startY = clientY
		prevX = clientX
		prevY = clientY

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	onMounted(() => {
		if (!el.value) return
		el.value.addEventListener('mousedown', onMousedown)
	})

	onBeforeUnmount(onMouseup)

	return {drag}
}
