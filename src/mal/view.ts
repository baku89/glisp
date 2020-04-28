import {replEnv} from './repl'
import Env from './env'
import {MalVal, symbolFor as S, createMalVector} from './types'
import readStr from './reader'
import {consoleEnv} from './console'
import evalExp from './eval'
import {readEvalStr} from '.'
import {appHandler} from './console'

replEnv.set(S('insert-exp'), (item: MalVal) => {
	appHandler.emit('insert-exp', item)
	return null
})

interface ViewREPOptions {
	width: number
	height: number
	updateConsole: boolean
	drawGuide: boolean
}

export function viewREP(
	str: string | MalVal,
	options: ViewREPOptions
): {env: Env; output: MalVal} {
	const {width, height, updateConsole, drawGuide} = options

	const viewEnv = new Env(replEnv)
	viewEnv.name = 'view'

	viewEnv.set(S('$width'), width)
	viewEnv.set(S('$height'), height)
	viewEnv.set(S('$size'), createMalVector([width, height]))

	if (!drawGuide) {
		readEvalStr('(defn guide (body) nil)', viewEnv)
	}

	let output: MalVal = null

	const src = typeof str === 'string' ? readStr(str) : str
	output = evalExp(src, viewEnv, true)

	if (updateConsole) {
		consoleEnv.outer = viewEnv
	}

	return {
		env: viewEnv,
		output
	}
}
