import {toRefs, reactive} from '@vue/composition-api'
import hotkeys from 'hotkeys-js'
import keycode from 'keycode'

let state: any

hotkeys('*', {keyup: true, keydown: true}, (e: KeyboardEvent) => {
	if (!state) {
		state = toRefs(
			reactive({
				shift: false,
				alt: false,
				ctrl: false
			} as {[keycode: string]: boolean})
		)
	}

	const code = keycode(e)
	if (code in state) {
		state[code].value = e.type === 'keydown'
	}
})

export default function useKeyboardState() {
	return state
}
