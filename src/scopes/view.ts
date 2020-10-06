import {MalFunc, MalNil} from '@/mal/types'
import AppScope from './app'
import Scope from '@/mal/scope'
import Env from '@/mal/env'
import {jsToMal} from '@/mal/reader'

interface ViewScopeOption {
	guideColor: string | null
}

function onSetup(scope: Scope, option: ViewScopeOption) {
	const {guideColor} = option

	const env = new Env()

	if (guideColor) {
		env.set('*guide-color*', jsToMal(guideColor))
	} else {
		env.set(
			'guide/stroke',
			MalFunc.create(() => MalNil.create())
		)
	}

	scope.popBinding()
	scope.pushBinding(env)
}

export function createViewScope() {
	return new Scope(AppScope, 'view', onSetup)
}

export default createViewScope()
