import {onBeforeUnmount, Ref, reactive, onMounted} from '@vue/composition-api'

interface DragData {
	x: number
	y: number
	deltaX: number
	deltaY: number
	isDragging: boolean
	prevX: number
	prevY: number
}

interface DraggableOptions {
	coordinate?: 'center'
	onClick?: () => void
	onDrag?: (drag: DragData) => void
	onDragStart?: (drag: DragData) => void
}

export default function useDraggable(
	el: Ref<null | HTMLElement>,
	options: DraggableOptions = {}
) {
	const drag = reactive({
		x: 0,
		y: 0,
		deltaX: 0,
		deltaY: 0,
		isDragging: false,
		prevX: 0,
		prevY: 0,
	})

	let originX = 0,
		originY = 0,
		prevX = 0,
		prevY = 0,
		hasDragged = false

	function onMousedrag(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.x = clientX - originX
		drag.y = clientY - originY
		drag.deltaX = drag.x - prevX
		drag.deltaY = drag.y - prevY

		if (options.onDragStart && !hasDragged) {
			options.onDragStart(drag)
		}

		if (Math.abs(drag.x) > 2 || Math.abs(drag.y) > 2) {
			hasDragged = true
		}

		if (options.onDrag) {
			options.onDrag(drag)
		}

		drag.prevX = prevX = drag.x
		drag.prevY = prevY = drag.y
	}

	function onMouseup() {
		if (!hasDragged && options.onClick) {
			options.onClick()
		}

		drag.isDragging = false
		drag.x = 0
		drag.y = 0
		drag.deltaX = 0
		drag.deltaY = 0
		originX = 0
		originY = 0
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	function onMousedown(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.isDragging = true
		if (options.coordinate === 'center' && el.value) {
			const {left, top, width, height} = el.value.getBoundingClientRect()
			originX = left + width / 2
			originY = top + height / 2
		} else {
			originX = clientX
			originY = clientY
		}
		drag.prevX = prevX = 0
		drag.prevY = prevY = 0
		hasDragged = false

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	onMounted(() => {
		if (!el.value) return
		el.value.addEventListener('mousedown', onMousedown)
	})

	onBeforeUnmount(onMouseup)

	return drag
}
