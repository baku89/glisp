import {toRefs, reactive, Ref} from '@vue/composition-api'
import hotkeys from 'hotkeys-js'
import keycode from 'keycode'

let state: {[keycode: string]: Ref<boolean>}

hotkeys('*', {keyup: true, keydown: true}, (e: KeyboardEvent) => {
	if (!state) {
		return
	}

	const code = keycode(e)
	if (code in state) {
		state[code].value = e.type === 'keydown'
	}
})

export default function useKeyboardState() {
	state = toRefs(
		reactive({
			shift: false,
			alt: false,
			ctrl: false
		})
	)

	return state
}
