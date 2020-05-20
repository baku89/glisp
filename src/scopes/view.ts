import {markMalVector, symbolFor as S} from '@/mal/types'
import Scope from '@/mal/scope'

import ReplScope from './repl'
import Env from '@/mal/env'

interface ViewScopeOption {
	width: number
	height: number
	guideColor: string | null
}

function onSetup(scope: Scope<ViewScopeOption>, option: ViewScopeOption) {
	const {width, height, guideColor} = option

	const env = new Env()

	env.set(S('*width*'), width)
	env.set(S('*height*'), height)
	env.set(S('*size*'), markMalVector([width, height]))

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
