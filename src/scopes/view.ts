import {symbolFor as S} from '@/mal/types'
import Scope from '@/mal/scope'

import ReplScope from './repl'
import Env from '@/mal/env'

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
	return new Scope<ViewScopeOption>(ReplScope, 'view', onSetup, true)
}

export default createViewScope()
