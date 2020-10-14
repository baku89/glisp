import WebMidi, {Input, InputEventNoteon} from 'webmidi'

import Device from './device'

export default class DeviceMidi extends Device {
	private inputs?: Input[]
	private callbacks: {[command: string]: () => any} = {}
	private listeningCallback: null | ((command: string) => any) = null

	constructor() {
		super()

		WebMidi.enable(() => {
			this.inputs = WebMidi.inputs

			this.inputs?.forEach(input => {
				input.addListener('noteon', 'all', this.onInput.bind(this))
			})
		})
	}

	private onInput(ev: InputEventNoteon) {
		const name = ev.target.name
		const ch = ev.data[1]

		const command = `${name}/${ch}`

		if (this.listeningCallback) {
			this.listeningCallback(command)
			this.listeningCallback = null
		} else {
			const cb = this.callbacks[command]
			if (cb) cb()
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
