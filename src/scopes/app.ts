import Mousetrap from 'mousetrap'

import Scope from '@/glisp/scope'
import {isList, GlispError, Expr} from '@/glisp/types'

import ConsoleScope from './console'
import ReplScope from './repl'

function onSetup() {
	AppScope.readEval('(unset-all-keybinds)')
}

const AppScope = new Scope(ReplScope, 'app', onSetup)

// Keybinds

AppScope.def('set-keybind', (keybind: Expr, exp: Expr) => {
	if (typeof keybind !== 'string' || !isList(exp)) {
		throw new GlispError('Invalid argument for set-keybind')
	}

	const callback = (e: KeyboardEvent) => {
		e.stopPropagation()
		e.preventDefault()
		ConsoleScope.eval(exp)
	}

	Mousetrap.bind(keybind, callback)

	return true
})

AppScope.def('trigger-keybind', (keybind: Expr) => {
	if (typeof keybind !== 'string') {
		throw new GlispError('Keybind should be string')
	}

	Mousetrap.trigger(keybind)

	return true
})

AppScope.def('unset-all-keybinds', () => {
	Mousetrap.reset()

	return true
})

AppScope.def('*global-menu*', [])
AppScope.def('set-global-menu', (menu: Expr) => {
	AppScope.def('*global-menu*', menu)
	return true
})

export default AppScope
