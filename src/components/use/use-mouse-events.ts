import {Ref, onUnmounted, ref, onMounted, unref} from '@vue/composition-api'

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
		if (ignorePredicate && ignorePredicate(e)) {
			return
		}
		if (e.button === 0) {
			const pressed = e.type === 'mousedown'
			mousePressed.value = pressed
			if (pressed && onDown) {
				onDown(e)
			} else if (!pressed && onUp) {
				onUp(e)
			}
		}
	}

	onMounted(() => {
		const el = unref(target)
		targetEl =
			el instanceof HTMLElement
				? el
				: el instanceof Object && el.$el instanceof HTMLElement
				? el.$el
				: undefined

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
