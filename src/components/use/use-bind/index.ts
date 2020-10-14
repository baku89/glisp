import {ref} from 'vue'
import Mousetrap from 'mousetrap'
import './mousetrap-global-bind'
import './mousetrap-record'

import Scope from '@/mal/scope'
import {MalError, MalNil, MalString, MalVal} from '@/mal/types'

export default function useBind(scope: Scope) {
	scope.def('set-bind', (command: MalVal, exp: MalVal) => {
		if (!MalString.is(command)) {
			throw new MalError('Command should be string')
		}

		const re = /^(.+?)\/(.*)$/.exec(command.value)
		if (!re) {
			throw new MalError('Invalid command form')
		}

		const callback = (e: KeyboardEvent) => {
			e.stopPropagation()
			e.preventDefault()
			scope.eval(exp)
		}

		const [, device, cmd] = re

		if (device === 'key') {
			console.log(cmd, callback)
			Mousetrap.bindGlobal(cmd, callback)
		}

		return MalNil.create()
	})

	const isRecordingBind = ref(false)

	scope.def('record-bind', async () => {
		return new Promise(resolve => {
			const activeElement = document.activeElement
			// Disable all keyboard event
			if (activeElement) {
				;(activeElement as HTMLElement).blur()
			}

			isRecordingBind.value = true

			// Listen
			;(Mousetrap as any).record((seq: string[]) => {
				// Callback
				if (activeElement) {
					;(activeElement as HTMLElement).focus()
				}
				isRecordingBind.value = false

				let bind = seq.join(' ')

				// Normalize bind
				if (/win/i.test(navigator.platform)) {
					bind = bind.replaceAll('ctrl', 'cmd')
				} else if (/mac/i.test(navigator.platform)) {
					bind = bind.replaceAll('meta', 'cmd')
				}

				resolve(MalString.create('key/' + bind))
			})
		})
	})

	return {isRecordingBind}
}
