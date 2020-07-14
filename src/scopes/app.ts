import Scope from '@/mal/scope'
import ReplScope from './repl'
import hotkeys from 'hotkeys-js'
import {MalVal, isList, MalError} from '@/mal/types'

const AppScope = new Scope(ReplScope, 'app')

AppScope.def('register-keybind', (keybind: MalVal, exp: MalVal) => {
	if (typeof keybind !== 'string' || !isList(exp)) {
		throw new MalError('Invalid argument for register-keybind')
	}

	hotkeys(keybind, e => {
		e.preventDefault()
		AppScope.eval(exp)
	})

	return null
})

export default AppScope
