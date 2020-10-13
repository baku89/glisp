import Mousetrap from 'mousetrap'
import './mousetrap-global-bind'
import './mousetrap-record'

import Scope from '@/mal/scope'
import {MalError, MalNil, MalString, MalVal} from '@/mal/types'
import {printer} from '@/mal/printer'

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

	scope.def('record-bind', () => {
		;(Mousetrap as any).record((seq: any) => {
			printer.log('You pressed: ' + seq.join(' '))
		})
		return MalNil.create()
	})
}
