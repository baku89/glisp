import _ from 'lodash'
import {Ref} from 'vue'

export interface Action {
	name: string
	icon?: string
	exec: (payloads: any) => any
}

export interface StoreModule {
	state: Record<string, Ref>
	actions: Record<string, Action>
}

type CreateStoreOptions = Record<string, StoreModule>

export interface Store {
	state: Record<string, Record<string, Ref>>
	getAction: (name: string) => Action
	commit: (name: string, payload: any) => any
}

export function createStore(options: CreateStoreOptions): Store {
	const state: Record<string, Record<string, Ref>> = {}
	const actions: Record<string, Action> = {}

	_.entries(options).forEach(([name, module]) => {
		_.entries(module.actions).forEach(([n, m]) => {
			actions[name + '/' + n] = m
		})
		state[name] = module.state
	})

	function commit(name: string, payload: any) {
		if (!(name in actions)) {
			throw new Error(`Action ${name} does not exist.`)
		}
		actions[name].exec(payload)
	}

	function getAction(name: string): Action {
		if (!(name in actions)) {
			throw new Error(`Action ${name} does not exist.`)
		}
		return actions[name]
	}

	return {
		state,
		getAction,
		commit,
	}
}
