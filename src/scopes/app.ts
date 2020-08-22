import Scope from '@/mal/scope'
import Mousetrap from 'mousetrap'
import ReplScope from './repl'
import {MalVal, isList, MalError} from '@/mal/types'
import ConsoleScope from './console'

function onSetup() {
	AppScope.readEval('(unset-all-keybinds)')
}

const AppScope = new Scope(ReplScope, 'app', onSetup)

// Keybinds

AppScope.def('set-keybind', (keybind: MalVal, exp: MalVal) => {
	if (typeof keybind !== 'string' || !isList(exp)) {
		throw new MalError('Invalid argument for set-keybind')
	}

	const callback = (e: KeyboardEvent) => {
		e.stopPropagation()
		e.preventDefault()
		ConsoleScope.eval(exp)
	}

	Mousetrap.bind(keybind, callback)

	return true
})

AppScope.def('trigger-keybind', (keybind: MalVal) => {
	if (typeof keybind !== 'string') {
		throw new MalError('Keybind should be string')
	}

	Mousetrap.trigger(keybind)

	return true
})

AppScope.def('unset-all-keybinds', () => {
	Mousetrap.reset()

	return true
})

AppScope.def('*global-menu*', [])
AppScope.def('set-global-menu', (menu: MalVal) => {
	AppScope.def('*global-menu*', menu)
	return true
})

export default AppScope
