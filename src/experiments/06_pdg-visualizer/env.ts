import {getAllRefs, PDG} from './glisp'

// Env
export default class Env {
	private outer?: Env

	private data: Record<string, PDG> = {}

	constructor(values?: Record<string, PDG>, outer?: Env) {
		this.outer = outer

		if (values) {
			this.data = {...values}
		}
	}

	getAllSymbols(): Record<string, PDG> {
		const symbols = {
			...(this.outer ? this.outer.getAllSymbols() : {}),
			...this.data,
		}
		return symbols
	}

	clearDep() {
		for (const [, value] of Object.entries(this.data)) {
			value.dep.clear()
		}
	}

	private resolve(s: string, pdg?: PDG): PDG | Error {
		if (s.startsWith('.')) {
			if (pdg?.parent) {
				return seekRelative(s, pdg.parent)
			} else {
				return new Error('Cannot resolve path symbol')
			}
		}

		return this.data[s] ?? this.outer?.resolve(s)

		function seekRelative(path: string, pdg: PDG): PDG | Error {
			// To ancestors
			if (path.startsWith('../')) {
				if (pdg.parent) {
					return seekRelative(path.slice(3), pdg.parent)
				} else {
					return new Error('No parent')
				}
			}
			if (path.startsWith('./')) {
				return seekRelative(path.slice(2), pdg)
			}

			// To decendants
			if (path.indexOf('/') !== -1) {
				let child: PDG | undefined
				const thisPath = path.slice(0, path.indexOf('/'))
				const restPath = path.slice(path.indexOf('/') + 1)
				switch (pdg.type) {
					case 'fncall':
						child = pdg.params[parseInt(thisPath)]
						break
					case 'graph':
						child = pdg.values[thisPath]
						break
				}
				if (child) {
					return seekRelative(restPath, child)
				} else {
					return new Error('No child')
				}
			}

			// Current
			switch (pdg.type) {
				case 'fncall':
					return pdg.params[parseInt(path)]
				case 'graph':
					return pdg.values[path]
				default:
					return new Error('Invalid path')
			}
		}
	}

	get(s: string, pdg: PDG): PDG | Error {
		const ref = this.resolve(s, pdg)

		if (ref instanceof Error) {
			return ref
		}

		if (isCircular(pdg, ref)) {
			// console.log('circular reference detected')
			return new Error('Circular reference')
		}

		return ref

		function isCircular(source: PDG, ref: PDG): boolean {
			return (
				source === ref ||
				Array.from(getAllRefs(ref)).some(d => isCircular(source, d))
			)
		}
	}
}
