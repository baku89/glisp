import isNodeJS from 'is-node'

import evalExp from './eval'
import readStr, {slurp} from './reader'
import Scope from './scope'
import {MalError, MalNil, MalString, MalVal} from './types'

export default async function initReplScope(scope: Scope) {
	function normalizeImportURL(url: string) {
		// Append .glisp if there's no extension
		if (!/\.[a-za-z0-9]+$/.test(url)) {
			url += '.glisp'
		}

		const isLibrary = !url.startsWith('.')
		const basepath = scope.var(isLibrary ? '*libpath*' : '*filename*')
			.value as string

		return new URL(url, basepath).href
	}

	// Defining essential functions
	scope.def('throw', (msg: MalString) => {
		throw new MalError(msg.value)
	})

	// Env variable
	scope.def('*is-node*', isNodeJS)
	scope.def('*host-language*', 'JavaScript')

	scope.def('normalize-import-url', (url: MalVal) => {
		return MalString.from(normalizeImportURL(url.value as string))
	})

	scope.def('eval', (exp: MalVal) => {
		return evalExp(exp, scope.env)
	})

	let filename: string
	if (isNodeJS) {
		filename = 'file://' + __filename
	} else {
		filename = new URL('.', document.baseURI).href
	}

	const libpath = new URL('./lib/', filename).href

	scope.def('*filename*', filename)
	scope.def('*libpath*', libpath)

	scope.def('import-force', async (_url: MalVal) => {
		const url = MalString.check(_url)

		const pwd = scope.var('*filename*') as MalString

		const absurl = normalizeImportURL(url)
		const text = slurp(absurl)

		let exp: MalVal

		if (url.endsWith('.js')) {
			eval(text)
			exp = (globalThis as any)['glisp_library']
		} else {
			exp = readStr(`(do ${text}\nnil)`)
		}

		scope.def('*filename*', absurl)
		await scope.eval(exp)
		scope.def('*filename*', pwd)

		return MalNil.from()
	})

	// Load core library as default
	await scope.REP('(import-force "core")')

	// Set the current filename to pwd
	if (isNodeJS) {
		scope.def('*filename*', process.cwd())
	}
}
