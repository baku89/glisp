import {Ref, onUnmounted, ref, onMounted, unref} from '@vue/composition-api'

export default function useMouseEvents(
	target: Ref<HTMLElement | any | null> | HTMLElement,
	ignorePredicate?: (e: MouseEvent) => boolean
) {
	const mouseX = ref(0)
	const mouseY = ref(0)
	const mousePressed = ref(false)

	let targetEl: HTMLElement | undefined

	function onMouseMove(e: MouseEvent) {
		mouseX.value = e.pageX
		mouseY.value = e.pageY
	}

	function onMouseToggle(e: MouseEvent) {
		if (ignorePredicate && ignorePredicate(e)) {
			return
		}
		if (e.button === 0) {
			mousePressed.value = e.type === 'mousedown'
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
