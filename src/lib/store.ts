import _ from 'lodash'
import objectPath from 'object-path'
import {readonly, Ref} from 'vue'

export interface Action {
	label?: string
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
	getState: <T>(name: string) => Ref<T>
	getAction: (name: string) => Action
	commit: (name: string, payload: any) => any
}

export function createStore(options: CreateStoreOptions): Store {
	const state: Record<string, Record<string, Ref>> = {}
	const actions: Record<string, Action> = {}

	_.entries(options).forEach(([name, module]) => {
		_.entries(module.actions).forEach(([n, m]) => {
			actions[name + '.' + n] = m
		})
		state[name] = _.mapValues(module.state, readonly)
	})

	function commit(name: string, payload: any) {
		if (!(name in actions)) {
			throw new Error(`Action ${name} does not exist.`)
		}
		actions[name].exec(payload)
	}

	function getState<T>(name: string): Ref<T> {
		const s = objectPath.get(state, name)
		if (!s) {
			throw new Error(`State ${name} does not exist.`)
		}
		return s
	}

	function getAction(name: string): Action {
		if (!(name in actions)) {
			throw new Error(`Action ${name} does not exist.`)
		}
		return actions[name]
	}

	return {
		state,
		getState,
		getAction,
		commit,
	}
}
