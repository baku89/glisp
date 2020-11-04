import Env from '@/mal/env'
import {readJS} from '@/mal/reader'
import Scope from '@/mal/scope'
import {MalFn, MalNil} from '@/mal/types'

import AppScope from './app'

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
