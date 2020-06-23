import {Ref, onMounted, onBeforeMount} from '@vue/composition-api'
import ResizeSensor from 'resize-sensor'

export default function useResizeSensor(
	el: Ref<HTMLElement | null>,
	onResized: (el: HTMLElement) => any,
	immediate = false
) {
	let sensor: any

	onMounted(() => {
		if (!el.value) return
		sensor = new ResizeSensor(el.value, () =>
			onResized(el.value as HTMLElement)
		)
		if (immediate) {
			onResized(el.value)
		}
	})

	onBeforeMount(() => {
		if (sensor) {
			sensor.detach()
		}
	})
}
