import EventEmitter from 'eventemitter3'
import {replEnv} from './repl'
import Env from './env'
import {MalVal, LispError, isKeyword, symbolFor as S, MalVector} from './types'
import {printer} from './printer'
import readStr from './reader'
import {consoleEnv} from './console'
import evalExp from './eval'
import {readEvalStr} from '.'

export const viewHandler = new EventEmitter()

function createHashMap(arr: MalVal[]) {
	const ret: {[key: string]: MalVal | MalVal[]} = {}
	const counts: {[key: string]: number} = {}

	counts['_'] = 0

	for (let i = 0, keyword = '_'; i < arr.length; i++) {
		if (isKeyword(arr[i])) {
			keyword = (arr[i] as string).slice(1)
			counts[keyword] = 0
		} else {
			if (++counts[keyword] === 1) {
				ret[keyword] = arr[i]
			} else if (counts[keyword] === 2) {
				ret[keyword] = [ret[keyword], arr[i]]
			} else {
				;(ret[keyword] as MalVal[]).push(arr[i])
			}
		}
	}
	return ret
}

replEnv.set(S('$insert'), (item: MalVal) => {
	viewHandler.emit('$insert', item)
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
	viewEnv.set(S('$size'), MalVector.from([width, height]))

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
