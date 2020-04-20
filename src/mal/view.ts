import EventEmitter from 'eventemitter3'
import {replEnv} from './repl'
import Env from './env'
import {MalVal, LispError, isKeyword, symbolFor as S} from './types'
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

export function viewREP(
	str: string | MalVal,
	canvas: HTMLCanvasElement,
	updateConsole = true,
	drawGuide = true
): {env: Env | false; output: MalVal} {
	const viewEnv = new Env(replEnv)
	viewEnv.name = 'view'

	const dpi = window.devicePixelRatio
	viewEnv.set(S('$width'), canvas.clientWidth / dpi)
	viewEnv.set(S('$height'), canvas.clientHeight / dpi)

	if (!drawGuide) {
		readEvalStr('(defn guide (body) nil)', viewEnv)
	}

	let output: MalVal = null
	let succeed = true

	try {
		// console.time('read')
		const src = typeof str === 'string' ? readStr(str) : str
		// console.timeEnd('read')
		// console.time('eval')
		output = evalExp(src, viewEnv)
		// console.timeEnd('eval')
	} catch (err) {
		if (err instanceof LispError) {
			printer.error(err)
		} else {
			printer.error(err.stack)
		}
		succeed = false
	}

	if (succeed && updateConsole) {
		// Draw
		consoleEnv.outer = viewEnv
	}

	return {
		env: succeed ? viewEnv : false,
		output: output
	}
}
