import {PDG} from './repl'

// Env
export default class Env {
	private outer?: Env

	private data: {[name: string]: PDG} = {}
	private resolving = new Set<PDG>()

	constructor(values?: {[s: string]: PDG}, outer?: Env) {
		this.outer = outer

		if (values) {
			this.data = {...values}
		}
	}

	getAllSymbols(): {[name: string]: PDG} {
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

	get(s: string, pdg?: PDG): PDG | undefined {
		if (s.startsWith('.')) {
			if (pdg?.parent) {
				return seekRelative(s, pdg.parent)
			} else {
				return undefined
			}
		}

		return this.data[s] ?? this.outer?.get(s)

		function seekRelative(path: string, pdg: PDG): PDG | undefined {
			// To upper
			if (path.startsWith('../')) {
				if (pdg.parent) {
					return seekRelative(path.slice(3), pdg.parent)
				} else {
					return undefined
				}
			} else if (path.startsWith('./')) {
				return seekRelative(path.slice(2), pdg)
			}

			// To down
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
					return undefined
				}
			}

			// Current
			switch (pdg.type) {
				case 'fncall':
					return pdg.params[parseInt(path)]
				case 'graph':
					return pdg.values[path]
				default:
					return undefined
			}
		}
	}

	setResolving(pdg: PDG, flag: boolean) {
		this.resolving[flag ? 'add' : 'delete'](pdg)
	}

	isResolving(pdg: PDG): boolean {
		return this.resolving.has(pdg) || this.outer?.isResolving(pdg) || false
	}
}
