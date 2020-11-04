import Mousetrap from 'mousetrap'

import Scope from '@/mal/scope'
import {MalBoolean, MalError, MalList, MalVal} from '@/mal/types'

import ConsoleScope from './console'
import ReplScope from './repl'

function onSetup() {
	AppScope.readEval('(unset-all-keybinds)')
}

const AppScope = new Scope(ReplScope, 'app', onSetup)

// Keybinds

AppScope.def('set-keybind', (keybind: MalVal, exp: MalVal) => {
	if (typeof keybind !== 'string' || !MalList.is(exp)) {
		throw new MalError('Invalid argument for set-keybind')
	}

	const callback = (e: KeyboardEvent) => {
		e.stopPropagation()
		e.preventDefault()
		ConsoleScope.eval(exp)
	}

	Mousetrap.bind(keybind, callback)

	return MalBoolean.from(true)
})

AppScope.def('trigger-keybind', (keybind: MalVal) => {
	if (typeof keybind !== 'string') {
		throw new MalError('Keybind should be string')
	}

	Mousetrap.trigger(keybind)

	return MalBoolean.from(true)
})

AppScope.def('unset-all-keybinds', () => {
	Mousetrap.reset()

	return MalBoolean.from(true)
})

AppScope.def('*global-menu*', [])
AppScope.def('set-global-menu', (menu: MalVal) => {
	AppScope.def('*global-menu*', menu)
	return MalBoolean.from(true)
})

export default AppScope
