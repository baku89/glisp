import {Ref, ref} from 'vue'

import {
	Expr,
	ExprColl,
	getName,
	GlispError,
	isKeyword,
	markParent,
} from '@/glisp'
import AppScope from '@/scopes/app'

type Commit = [ExprColl, Set<string>]

export default function useExpHistory(
	_exp: Ref<ExprColl>,
	updateExp: (exp: ExprColl, pushHistory?: boolean) => any
) {
	const history: Ref<Commit[]> = ref([])

	function pushExpHistory(newExp: ExprColl, tag?: string) {
		history.value.push([newExp, new Set(tag ? [tag] : undefined)])
	}

	function undoExp(tag?: string) {
		let index = -1
		if (tag) {
			for (let i = history.value.length - 2; i >= 0; i--) {
				if (history.value[i][1].has(tag)) {
					index = i
					break
				}
			}
		} else {
			if (history.value.length > 2) {
				index = history.value.length - 2
			}
		}

		if (index === -1) {
			return false
		}

		const [prev] = history.value[index]
		history.value.length = index + 1
		markParent(prev)
		updateExp(prev, false)

		return true
	}

	AppScope.def('revert-history', (arg: Expr) => {
		if (typeof arg !== 'string') {
			return undoExp()
		} else {
			const tag = getName(arg)
			return undoExp(tag)
		}
	})

	function tagExpHistory(tag: string) {
		if (history.value.length > 0) {
			history.value[history.value.length - 1][1].add(tag)
		}
	}

	AppScope.def('tag-history', (tag: Expr) => {
		if (!(typeof tag === 'string' || isKeyword(tag))) {
			throw new GlispError('tag is not a string/keyword')
		}
		tagExpHistory(getName(tag))
		return true
	})

	return {pushExpHistory, tagExpHistory}
}
