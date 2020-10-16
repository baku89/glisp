import {vec2} from 'gl-matrix'
import {onBeforeUnmount, Ref, reactive, onMounted, toRefs, computed} from 'vue'

interface DragData {
	pos: vec2
	prevPos: vec2
	startPos: vec2
	delta: vec2
	origin: vec2
	isMousedown: boolean
	isDragging: boolean
}

interface DraggableOptions {
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
		// Origin is the centre of element
		pos: vec2.create(),
		prevPos: vec2.create(),
		startPos: vec2.create(),
		delta: vec2.create(),

		// Origin position in viewport
		origin: vec2.create(),
		isMousedown: false,
		isDragging: false,
	}) as DragData

	const absolutePos = computed(() => {
		return vec2.add(vec2.create(), drag.origin, drag.pos)
	})

	function updatePosAndOrigin(e: MouseEvent) {
		const {clientX, clientY} = e
		const {
			left,
			top,
			right,
			bottom,
		} = (el.value as HTMLElement).getBoundingClientRect()

		drag.origin = vec2.fromValues((left + right) / 2, (top + bottom) / 2)

		drag.pos = vec2.fromValues(
			clientX - drag.origin[0],
			clientY - drag.origin[1]
		)
	}

	function onMousedown(e: MouseEvent) {
		updatePosAndOrigin(e)
		drag.isMousedown = true
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
		updatePosAndOrigin(e)
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
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	// Hooks
	onMounted(() => {
		if (!el.value) return
		el.value.addEventListener('mousedown', onMousedown)
	})

	onBeforeUnmount(onMouseup)

	return {...toRefs(drag), absolutePos}
}
