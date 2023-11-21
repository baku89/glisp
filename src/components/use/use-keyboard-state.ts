import hotkeys from 'hotkeys-js'
import keycode from 'keycode'
import {reactive, Ref, toRefs} from 'vue'

import {getName, MalVal} from '@/mal/types'
import AppScope from '@/scopes/app'

let state: {[keycode: string]: Ref<boolean>}

hotkeys('*', {keyup: true, keydown: true}, (e: KeyboardEvent) => {
	if (!state) {
		return
	}

	let code = keycode(e)

	if (code.includes('command')) {
		code = 'ctrl'
	}

	if (code in state) {
		state[code].value = e.type === 'keydown'
	}
})

export default function useKeyboardState() {
	if (!state) {
		state = toRefs(
			reactive({
				shift: false,
				alt: false,
				ctrl: false,
			})
		)
	}

	AppScope.def('modifier-pressed?', (...keys: MalVal[]) => {
		for (const key of keys) {
			const code = getName(key)
			if (!state[code] || !state[code].value) {
				return false
			}
		}

		return true
	})

	return state
}
