import Mousetrap from 'mousetrap'
import './mousetrap-global-bind'
import './mousetrap-record'

import Device from '../device'

export default class DeviceKeyboard extends Device {
	private activeElement: HTMLElement | undefined
	private isCapturing = false

	bind(command: string, callback: () => any) {
		// Convert to Mousetrap representation
		const _command = command.replaceAll('cmd', 'mod')

		Mousetrap.bindGlobal(_command, e => {
			e.preventDefault()
			e.stopPropagation()
			callback()
		})
	}

	capture(callback: (command: string) => any) {
		this.activeElement = document.activeElement as HTMLElement

		// Disable all keyboard event
		this.activeElement?.blur()
		this.isCapturing = true

		// Listen
		;(Mousetrap as any).record((seq: string[]) => {
			if (!this.isCapturing) return

			this.activeElement?.focus()

			let command = seq.join(' ')

			// Normalize command between OS
			if (/win/i.test(navigator.platform)) {
				command = command.replaceAll('ctrl', 'cmd')
			} else if (/mac/i.test(navigator.platform)) {
				command = command.replaceAll('meta', 'cmd')
			}

			callback(command)
		})
	}

	cancelCapture() {
		if (!this.isCapturing) return

		this.activeElement?.focus()
		this.isCapturing = false
	}
}
