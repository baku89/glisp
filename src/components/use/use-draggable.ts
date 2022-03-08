import {unrefElement} from '@vueuse/core'
import {vec2} from 'gl-matrix'
import {reactive, Ref, ref, toRefs, watch} from 'vue'

interface DragData {
	pos: vec2
	prevPos: vec2
	startPos: vec2
	delta: vec2
	top: number
	right: number
	bottom: number
	left: number
	origin: vec2
	isMousedown: boolean
	isDragging: boolean
}

interface DraggableOptions {
	disableClick?: boolean
	lockPointer?: boolean
	enabled?: Ref<boolean>
	pointerType?: PointerEvent['pointerType'][]
	onClick?: () => void
	onDrag?: (drag: DragData) => void
	onDragStart?: (drag: DragData) => void
	onDragEnd?: (drag?: DragData) => void
}

export default function useDraggable(
	target: Ref<null | HTMLElement>,
	options: DraggableOptions = {}
) {
	const drag = reactive({
		// All coordinates are relative to the viewport
		pos: vec2.create(),
		prevPos: vec2.create(),
		startPos: vec2.create(),
		delta: vec2.create(),

		top: 0,
		right: 0,
		bottom: 0,
		left: 0,

		// Viewport position
		origin: vec2.create(),

		isMousedown: false,
		isDragging: false,
	}) as DragData

	const enabled = options.enabled ?? ref(true)

	function setup(el: HTMLElement) {
		el.addEventListener('pointerdown', onPointerDown)

		function updatePosAndOrigin(e: PointerEvent) {
			if ('movementX' in e) {
				const movement = vec2.fromValues(e.movementX, e.movementY)
				drag.pos = vec2.add(vec2.create(), drag.pos, movement)
			} else {
				drag.pos = vec2.fromValues(e.clientX, e.clientY)
			}

			const {left, top, right, bottom} = el.getBoundingClientRect()

			drag.origin = vec2.fromValues((left + right) / 2, (top + bottom) / 2)

			drag.top = top
			drag.right = right
			drag.bottom = bottom
			drag.left = left
		}

		function onPointerDown(e: PointerEvent) {
			// Ignore non-left click
			if (
				!enabled.value ||
				e.button !== 0 ||
				(options.pointerType && !options.pointerType.includes(e.pointerType))
			) {
				return
			}

			// Initialzize pointer position
			drag.pos = vec2.fromValues(e.clientX, e.clientY)

			updatePosAndOrigin(e)
			drag.isMousedown = true
			drag.prevPos = vec2.clone(drag.pos)
			drag.startPos = vec2.clone(drag.pos)

			// Fire onDragstart and onDrag
			if (options.disableClick) {
				startDrag()
				options.onDrag && options.onDrag(drag)
			}

			window.addEventListener('pointermove', onPointerDrag)
			window.addEventListener('pointerup', onPointerUp, {once: true})
		}

		function startDrag() {
			if (options.lockPointer && 'requestPointerLock' in el) {
				el.requestPointerLock()
			}

			drag.isDragging = true
			options.onDragStart && options.onDragStart(drag)
		}

		function onPointerDrag(e: PointerEvent) {
			updatePosAndOrigin(e)
			drag.delta = vec2.sub(vec2.create(), drag.pos, drag.prevPos)

			if (!drag.isDragging) {
				// Determine whether dragging has start
				const d = vec2.dist(drag.startPos, drag.pos)
				if (d <= (navigator.maxTouchPoints > 0 ? 6 : 2)) {
					return
				}
				startDrag()
			}

			options.onDrag && options.onDrag(drag)
			drag.prevPos = vec2.clone(drag.pos)
		}

		function onPointerUp() {
			if (options.lockPointer && 'exitPointerLock' in document) {
				document.exitPointerLock()
			}
			if (drag.isDragging) {
				options.onDragEnd && options.onDragEnd(drag)
			} else {
				options.onClick && options.onClick()
			}

			// Reset
			drag.isMousedown = false
			drag.isDragging = false
			drag.pos = vec2.create()
			drag.startPos = vec2.create()
			drag.delta = vec2.create()
			window.removeEventListener('pointermove', onPointerDrag)
		}
	}

	// Hooks
	watch(
		target,
		() => {
			const el = unrefElement(target)
			if (!el) return
			setup(el)
		},
		{immediate: true, flush: 'post'}
	)

	return toRefs(drag)
}
