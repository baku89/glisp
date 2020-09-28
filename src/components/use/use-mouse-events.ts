import {Ref, onUnmounted, ref, onMounted} from 'vue'
import {getHTMLElement} from '@/utils'

export default function useMouseEvents(
	target: Ref<HTMLElement | any | null> | HTMLElement,
	{
		ignorePredicate,
		onMove,
		onDown,
		onDrag,
		onUp,
	}: {
		ignorePredicate?: (e: MouseEvent) => boolean
		onMove?: (e: MouseEvent) => any
		onDown?: (e: MouseEvent) => any
		onDrag?: (e: MouseEvent) => any
		onUp?: (e: MouseEvent) => any
	}
) {
	const mouseX = ref(0)
	const mouseY = ref(0)
	const mousePressed = ref(false)

	let targetEl: HTMLElement | undefined

	function onMouseMove(e: MouseEvent) {
		mouseX.value = e.pageX
		mouseY.value = e.pageY
		if (!mousePressed.value && onMove) {
			onMove(e)
		} else if (mousePressed.value && onDrag) {
			onDrag(e)
		}
	}

	function onMouseToggle(e: MouseEvent) {
		const pressed = e.type === 'mousedown'
		if (
			(pressed && ignorePredicate && ignorePredicate(e)) ||
			(!pressed && !mousePressed.value)
		) {
			return
		}
		if (e.button === 0) {
			mousePressed.value = pressed
			if (pressed && onDown) {
				onDown(e)
			} else if (!pressed && onUp) {
				onUp(e)
			}
		}
	}

	onMounted(() => {
		targetEl = getHTMLElement(target)

		if (!targetEl) return
		targetEl.addEventListener('mousemove', onMouseMove)
		targetEl.addEventListener('mousedown', onMouseToggle)
		window.addEventListener('mouseup', onMouseToggle)
	})

	onUnmounted(() => {
		if (!targetEl) return
		targetEl.removeEventListener('mousemove', onMouseMove)
		targetEl.removeEventListener('mousedown', onMouseToggle)
		window.removeEventListener('mouseup', onMouseToggle)
	})

	return {mouseX, mouseY, mousePressed}
}
