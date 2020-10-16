import {vec2} from 'gl-matrix'
import {onBeforeUnmount, Ref, reactive, onMounted} from 'vue'

interface DragData {
	pos: vec2
	prevPos: vec2
	delta: vec2
	isMousedown: boolean
	isDragging: boolean
}

interface DraggableOptions {
	coordinate?: 'center'
	disableClick?: boolean
	onClick?: () => void
	onDrag?: (drag: DragData) => void
	onDragStart?: (drag: DragData) => void
	onDragEnd?: (drag?: DragData) => void
}

export default function useDraggable(
	el: Ref<null | HTMLElement>,
	options: DraggableOptions = {}
) {
	const drag = reactive({
		pos: vec2.create(),
		prevPos: vec2.create(),
		delta: vec2.create(),
		isMousedown: false,
		isDragging: false,
	}) as DragData

	let origin = vec2.create()

	function updateOrigin(e: MouseEvent) {
		const {clientX, clientY} = e
		if (options.coordinate === 'center' && el.value) {
			const {left, top, width, height} = el.value.getBoundingClientRect()
			origin = vec2.fromValues(left + width / 2, top + height / 2)
		} else {
			origin = vec2.fromValues(clientX, clientY)
		}
	}

	function onMousedown(e: MouseEvent) {
		updateOrigin(e)

		const {clientX, clientY} = e

		drag.isMousedown = true
		drag.pos = vec2.fromValues(clientX - origin[0], clientY - origin[1])
		drag.prevPos = vec2.clone(drag.pos)

		// Fire onDragstart and onDrag
		if (options.disableClick) {
			drag.isDragging = true
			if (options.onDragStart) options.onDragStart(drag)
			if (options.onDrag) options.onDrag(drag)
		}

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	function onMousedrag(e: MouseEvent) {
		updateOrigin(e)

		const {clientX, clientY} = e

		drag.pos = vec2.fromValues(clientX - origin[0], clientY - origin[1])
		drag.delta = vec2.sub(vec2.create(), drag.pos, drag.prevPos)

		if (!drag.isDragging) {
			// Just start drag
			if (Math.abs(drag.pos[0]) > 2 || Math.abs(drag.pos[1]) > 2) {
				if (options.onDragStart) options.onDragStart(drag)
				drag.isDragging = true
			}
		}

		if (options.onDrag) options.onDrag(drag)

		drag.prevPos = vec2.clone(drag.pos)
	}

	function onMouseup() {
		if (drag.isDragging) {
			if (options.onDragEnd) options.onDragEnd(drag)
		} else {
			if (options.onClick) options.onClick()
		}

		// Reset
		drag.isMousedown = false
		drag.isDragging = false
		drag.pos = vec2.create()
		drag.delta = vec2.create()
		origin = vec2.create()
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	// Hooks
	onMounted(() => {
		if (!el.value) return
		el.value.addEventListener('mousedown', onMousedown)
	})

	onBeforeUnmount(onMouseup)

	return drag
}
