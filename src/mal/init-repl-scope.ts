import isNodeJS from 'is-node'
import {MalVal, MalError, MalString, MalNil} from './types'
import readStr, {slurp} from './reader'
import Scope from './scope'
import evalExp from './eval'

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
		return MalString.create(normalizeImportURL(url.value as string))
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

	console.log(filename, libpath)

	scope.def('*filename*', filename)
	scope.def('*libpath*', libpath)

	scope.def('import-force', async (_url: MalVal) => {
		const url = MalString.check(_url)

		const pwd = scope.var('*filename*') as MalString

		const absurl = normalizeImportURL(url)
		const text = slurp(absurl)
		console.log('IMPORT=', absurl, text.slice(0, 30))

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

		return MalNil.create()
	})

	// Syntactic sugar
	scope.def('with-meta-sugar', (meta: MalVal, x: MalVal) => x.withMeta(meta))

	// Load core library as default
	await scope.REP('(import-force "core")')

	// Set the current filename to pwd
	if (isNodeJS) {
		scope.def('*filename*', process.cwd())
	}
}
