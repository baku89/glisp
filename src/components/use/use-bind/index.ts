import {ref} from 'vue'

import Scope from '@/mal/scope'
import {MalError, MalFn, MalNil, MalString, MalVal} from '@/mal/types'
import Device, {DeviceKeyboard} from './device'

export default function useBind(scope: Scope) {
	const devices = {
		key: new DeviceKeyboard(),
	} as {[name: string]: Device}

	scope.def('set-bind', (command: MalVal, fn: MalVal) => {
		if (!MalString.is(command)) {
			throw new MalError('Command should be string')
		}
		if (!MalFn.is(fn)) {
			throw new Error('exp should be function')
		}

		const re = /^(.+?)\/(.*)$/.exec(command.value)
		if (!re) {
			throw new MalError('Invalid command form')
		}

		const [, name, cmd] = re

		if (!(name in devices)) {
			throw new MalError(`Cannot find device "${name}"`)
		}

		const device = devices[name]
		device.bind(cmd, fn.value)

		return MalNil.create()
	})

	const isRecordingBind = ref(false)

	scope.def('record-bind', async () => {
		return new Promise(resolve => {
			isRecordingBind.value = true

			function onInput(name: string, cmd: string) {
				for (const device of Object.values(devices)) {
					device.abortListen()
				}

				isRecordingBind.value = false
				resolve(MalString.create(name + '/' + cmd))
			}

			for (const [name, device] of Object.entries(devices)) {
				device.listen(cmd => onInput(name, cmd))
			}
		})
	})

	return {isRecordingBind}
}
