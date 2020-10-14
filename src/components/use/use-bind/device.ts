import Mousetrap from 'mousetrap'
import './mousetrap-global-bind'
import './mousetrap-record'

export default abstract class Device {
	abstract bind(command: string, callback: () => any): any
	abstract listen(callback: (command: string) => any): any
	abstract abortListen(): any
}

export class DeviceKeyboard extends Device {
	private activeElement: HTMLElement | undefined
	private isListening = false

	bind(command: string, callback: () => any) {
		// Convert to Mousetrap representation
		const _command = command.replaceAll('cmd', 'mod')

		Mousetrap.bindGlobal(_command, e => {
			e.preventDefault()
			e.stopPropagation()
			callback()
		})
	}

	listen(callback: (command: string) => any) {
		this.activeElement = document.activeElement as HTMLElement

		// Disable all keyboard event
		this.activeElement?.blur()
		this.isListening = true

		// Listen
		;(Mousetrap as any).record((seq: string[]) => {
			if (!this.isListening) return

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

	abortListen() {
		if (!this.isListening) return

		this.activeElement?.focus()
		this.isListening = false
	}
}
