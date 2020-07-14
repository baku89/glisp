import Scope from '@/mal/scope'
import ReplScope from './repl'
import hotkeys from 'hotkeys-js'
import {MalVal, isList, MalError, MalJSFunc} from '@/mal/types'
import {printExp} from '@/mal'

function onSetup() {
	AppScope.readEval('(unregister-all-keybinds)')
}

const AppScope = new Scope(ReplScope, 'app', onSetup)

// Keybinds
type KeybindCallback = (e: KeyboardEvent) => void

const Keybinds: [string, KeybindCallback][] = []

AppScope.def('register-keybind', (keybind: MalVal, exp: MalVal) => {
	if (typeof keybind !== 'string' || !isList(exp)) {
		throw new MalError('Invalid argument for register-keybind')
	}

	const callback = (e: KeyboardEvent) => {
		e.stopPropagation()
		e.preventDefault()
		AppScope.eval(exp)
	}

	hotkeys(keybind, {}, callback)
	Keybinds.push([keybind, callback])

	return null
})

AppScope.def('unregister-all-keybinds', () => {
	for (const [keybind, callback] of Keybinds) {
		hotkeys.unbind(keybind, callback)
	}

	Keybinds.length = 0

	return null
})

export default AppScope
