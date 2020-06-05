import {toRefs} from '@vue/composition-api'
import hotkeys from 'hotkeys-js'
import keycode from 'keycode'

const state = toRefs({
	shift: false,
	alt: false,
	ctrl: false
} as {[keycode: string]: boolean})

hotkeys('*', {keyup: true, keydown: true}, (e: KeyboardEvent) => {
	const code = keycode(e)
	if (code in state) {
		state[code].value = e.type === 'keydown'
	}
})

export default function useKeyboardState() {
	return state
}
