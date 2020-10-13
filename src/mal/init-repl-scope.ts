import isNodeJS from 'is-node'
import {MalVal, MalError, MalString, MalNil} from './types'
import readStr, {jsToMal, slurp} from './reader'
import Scope from './scope'
import evalExp from './eval'

export default function initReplScope(scope: Scope) {
	const normalizeImportURL = (() => {
		if (isNodeJS) {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const path = require('path')

			return (url: string) => {
				if (url.startsWith('.')) {
					// Relative
					const basepath = scope.var('*filename*').value as string
					return path.join(path.dirname(basepath), url)
				} else {
					// Library
					const basepath = scope.var('*libpath*').value as string
					return path.join(basepath, url)
				}
			}
		} else {
			return (url: string) => {
				if (url.startsWith('.')) {
					// Relative
					const basepath = scope.var('*filename*').value as string
					return new URL(url, basepath).href
				} else {
					// Library
					const basepath = scope.var('*libpath*').value as string
					return new URL(url, basepath).href
				}
			}
		}
	})()

	// Defining essential functions
	scope.def('throw', (msg: MalString) => {
		throw new MalError(msg.value)
	})

	// Env variable
	scope.def('*is-node*', isNodeJS)
	scope.def('*host-language*', 'JavaScript')

	scope.def('normalize-import-url', (url: MalVal) => {
		return MalString.create(normalizeImportURL(url.value as string))
	})

	scope.def('eval', (exp: MalVal) => {
		return evalExp(exp, scope.env)
	})

	let filename: string, libpath: string

	if (isNodeJS) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require('path')

		filename = __filename
		libpath = path.join(path.dirname(__filename), './lib')
	} else {
		filename = new URL('.', document.baseURI).href
		libpath = new URL('./lib/', document.baseURI).href
	}

	scope.def('*filename*', filename)
	scope.def('*libpath*', libpath)

	scope.def('import-force', (url: MalVal) => {
		let _url = url.value as string

		// Append .glisp if there's no extension
		if (!/\.[a-za-z]+$/.test(_url)) {
			_url += '.glisp'
		}

		const pwd = scope.var('*filename*') as MalString

		const absurl = normalizeImportURL(_url)
		const text = slurp(absurl)
		let exp: MalVal

		if (_url.endsWith('.js')) {
			eval(text)
			exp = (globalThis as any)['glisp_library']
		} else {
			exp = readStr(`(do ${text}\nnil)`)
		}

		scope.def('*filename*', absurl)
		scope.eval(exp)
		scope.def('*filename*', pwd)

		return MalNil.create()
	})

	// Load core library as default
	scope.REP('(import-force "core")')

	// Set the current filename to pwd
	if (isNodeJS) {
		scope.def('*filename*', process.cwd())
	}
}
