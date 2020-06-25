import useDraggable from './use-draggable'
import useKeyboardState from './use-keyboard-state'
import useResizeSensor from './use-resize-sensor'
import {ref} from '@vue/composition-api'

function useRem() {
	const rem = ref(
		parseFloat(getComputedStyle(document.documentElement).fontSize)
	)
	return rem
}

export {useDraggable, useKeyboardState, useResizeSensor, useRem}
