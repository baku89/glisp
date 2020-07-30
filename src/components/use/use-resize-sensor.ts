import {Ref, onMounted, onBeforeMount, unref} from '@vue/composition-api'
import ResizeSensor from 'resize-sensor'

export default function useResizeSensor(
	element: Ref<HTMLElement | null> | HTMLElement,
	onResized: (el: HTMLElement) => any,
	immediate = false
) {
	let sensor: any

	function setup(el: HTMLElement) {
		sensor = new ResizeSensor(el, () => onResized(el))
		if (immediate) {
			onResized(el)
		}
	}

	onMounted(() => {
		const el = unref(element)
		if (!el) return
		setup(el)
	})

	onBeforeMount(() => {
		if (sensor) {
			sensor.detach()
		}
	})
}
