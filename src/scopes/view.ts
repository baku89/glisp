import {createMalVector, markMalVector} from '@/mal/types'
import Scope from '@/mal/scope'

import ReplScope from './repl'

interface ViewScopeOption {
	width: number
	height: number
	guideColor: string | null
}

function onSetup(scope: Scope<ViewScopeOption>, option: ViewScopeOption) {
	const {width, height, guideColor} = option

	scope.def('$width', width)
	scope.def('$height', height)
	scope.def('$transform', markMalVector([1, 0, 0, 1, 0, 0]))
	scope.def('$size', createMalVector([width, height]))

	if (guideColor) {
		scope.def('$guide-color', guideColor)
	} else {
		scope.readEval('(defn guide (body) nil)')
	}
}

export function createViewScope() {
	return new Scope<ViewScopeOption>(ReplScope, 'view', onSetup)
}

export default createViewScope()
