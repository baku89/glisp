import {ref} from '@vue/composition-api'

import useDraggable from './use-draggable'
import useKeyboardState from './use-keyboard-state'
import useResizeSensor from './use-resize-sensor'
import useCommandModal from './use-command-modal'

function useRem() {
	const rem = ref(
		parseFloat(getComputedStyle(document.documentElement).fontSize)
	)
	return rem
}

export {
	useDraggable,
	useKeyboardState,
	useResizeSensor,
	useRem,
	useCommandModal
}
