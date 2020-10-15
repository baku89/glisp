import {MalFn, MalNil} from '@/mal/types'
import AppScope from './app'
import Scope from '@/mal/scope'
import Env from '@/mal/env'
import {readJS} from '@/mal/reader'

interface ViewScopeOption {
	guideColor: string | null
}

function onSetup(scope: Scope, option: ViewScopeOption) {
	const {guideColor} = option

	const env = new Env()

	if (guideColor) {
		env.set('*guide-color*', readJS(guideColor))
	} else {
		env.set(
			'guide/stroke',
			MalFn.from(() => MalNil.from())
		)
	}

	scope.popBinding()
	scope.pushBinding(env)
}

export function createViewScope() {
	return new Scope(AppScope, 'view', onSetup)
}

export default createViewScope()
