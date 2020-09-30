import {symbolFor as S} from '@/mal/types'
import Scope from '@/mal/scope'

import AppScope from './app'
import Env from '@/mal/env'

interface ViewScopeOption {
	guideColor: string | null
}

function onSetup(scope: Scope<ViewScopeOption>, option: ViewScopeOption) {
	const {guideColor} = option

	const env = new Env()

	if (guideColor) {
		env.set(MalSymbol.create('*guide-color*'), guideColor)
	} else {
		env.set(MalSymbol.create('guide/stroke'), () => null)
	}

	scope.popBinding()
	scope.pushBinding(env)
}

export function createViewScope() {
	return new Scope<ViewScopeOption>(AppScope, 'view', onSetup, true)
}

export default createViewScope()
