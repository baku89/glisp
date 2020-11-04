/// <reference types="@types/resize-observer-browser" />
import {onBeforeMount, onMounted, Ref, unref} from 'vue'

export default function useResizeSensor(
	element: Ref<HTMLElement | null> | HTMLElement,
	onResized: (el: HTMLElement) => any,
	immediate = false
) {
	let el: HTMLElement
	let observer: ResizeObserver

	onMounted(() => {
		const _el = unref(element)
		if (!_el) return

		el = _el

		observer = new ResizeObserver(() => {
			onResized(el)
		})
		observer.observe(el)

		if (immediate) {
			onResized(el)
		}
	})

	onBeforeMount(() => {
		if (observer) {
			observer.unobserve(el)
		}
	})
}
