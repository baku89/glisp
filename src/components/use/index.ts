import useDraggable from './use-draggable'
import useKeyboardState from './use-keyboard-state'
import useResizeSensor from './use-resize-sensor'
import {onMounted, ref} from '@vue/composition-api'

function useRem() {
	const rem = ref(0)

	onMounted(() => {
		rem.value = parseFloat(getComputedStyle(document.documentElement).fontSize)
	})

	return rem
}

export {useDraggable, useKeyboardState, useResizeSensor, useRem}
