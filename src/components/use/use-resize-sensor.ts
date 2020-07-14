import {Ref, onMounted, onBeforeMount, isRef} from '@vue/composition-api'
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

	if (isRef(element)) {
		onMounted(() => {
			if (!element.value) return
			setup(element.value)
		})
	} else {
		setup(element)
	}

	onBeforeMount(() => {
		if (sensor) {
			sensor.detach()
		}
	})
}
