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

type GamepadState = {
	[index: number]: Uint8Array
}

// https://w3c.github.io/gamepad/#remapping
const GamepadStandardButtonName = [
	'A', // button[0]: Bottom button in right cluster
	'B', // button[1]: Right button in right cluster
	'X', // button[2]: Left button in right cluster
	'Y', // button[3]: Top button in right cluster
	'L1', // buttons[4]: Top left front button
	'R1', // buttons[5]: Top right front button
	'L2', // buttons[6]: Bottom left front button
	'R2', // buttons[7]: Bottom right front button
	'select', // buttons[8]: Left button in center cluster
	'start', // buttons[9]: Right button in center cluster
	'L3', // buttons[10]: Left stick pressed button
	'R3', // buttons[11]: Right stick pressed button
	'up', // buttons[12]: Top button in left cluster
	'down', // buttons[13]: Bottom button in left cluster
	'left', // buttons[14]: Left button in left cluster
	'right', // buttons[15]: Right button in left cluster
	'home', // buttons[16]: Center button in center cluster
]

export class DeviceGamepad extends Device {
	private state: GamepadState = {}
	private callbacks: {[command: string]: () => any} = {}
	private listeningCallback: null | ((command: string) => any) = null

	constructor() {
		super()

		this.update = this.update.bind(this)
		requestAnimationFrame(this.update)
	}

	private update() {
		requestAnimationFrame(this.update)

		for (const gp of navigator.getGamepads()) {
			if (!gp || gp.mapping !== 'standard') continue

			const index = gp.index

			if (!this.state[index]) {
				this.state[index] = new Uint8Array(gp.buttons.length)
			}

			for (let i = 0; i < gp.buttons.length; i++) {
				// Check if the button is just pressed
				if (!this.state[index][i] && gp.buttons[i].pressed) {
					const buttonName = GamepadStandardButtonName[i]
					console.log('Just pressed index=', index, ' button=', buttonName)

					const command = `${index}/${buttonName}`

					if (this.listeningCallback) {
						// Listening callback
						this.listeningCallback(command)
						this.listeningCallback = null
					} else {
						// Revoke registered callback
						const cb = this.callbacks[command]
						if (cb) cb()
					}
				}

				// Update state
				this.state[index][i] = gp.buttons[i].value
			}
		}
	}

	bind(command: string, callback: () => any) {
		this.callbacks[command] = callback
	}

	listen(callback: (command: string) => any) {
		this.listeningCallback = callback
	}

	abortListen() {
		this.listeningCallback = null
	}
}
