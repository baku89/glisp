import Env from '@/mal/env'
import Scope from '@/mal/scope'
import {symbolFor as S} from '@/mal/types'

import AppScope from './app'

interface ViewScopeOption {
	guideColor: string | null
}

function onSetup(scope: Scope<ViewScopeOption>, option: ViewScopeOption) {
	const {guideColor} = option

	const env = new Env()

	if (guideColor) {
		env.set(S('*guide-color*'), guideColor)
	} else {
		env.set(S('guide/stroke'), () => null)
	}

	scope.popBinding()
	scope.pushBinding(env)
}

export function createViewScope() {
	return new Scope<ViewScopeOption>(AppScope, 'view', onSetup, true)
}

export default createViewScope()
