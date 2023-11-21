import Env from '@/glisp/env'
import Scope from '@/glisp/scope'
import {symbolFor as S} from '@/glisp/types'

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
