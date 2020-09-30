import {
	MalColl,
	getName,
	MalVal,
	MalError,
	MalKeyword,
	MalMap,
} from '@/mal/types'

import {Ref} from 'vue'
import {reconstructTree} from '@/mal/reader'
import AppScope from '@/scopes/app'

type Commit = {
	tag: Set<string>
	exp: MalColl
	activeModeIndex: number | undefined
	modeState: MalMap
}

export default function useExpHistory(
	activeModeIndex: Ref<number | undefined>,
	modeState: Ref<MalMap>,
	updateExp: (exp: MalColl, pushHistory?: boolean) => any
) {
	const history: Commit[] = []

	function pushExpHistory(exp: MalColl, tag?: string) {
		history.push({
			tag: new Set(tag ? [tag] : undefined),
			exp,
			activeModeIndex: activeModeIndex.value,
			modeState: modeState.value,
		})
	}

	function undoExp(tag?: string) {
		let index = -1
		if (tag) {
			for (let i = history.length - 2; i >= 0; i--) {
				if (history[i].tag.has(tag)) {
					index = i
					break
				}
			}
		} else {
			if (history.length > 2) {
				index = history.length - 2
			}
		}

		if (index === -1) {
			return false
		}

		const commit = history[index]
		history.length = index + 1
		reconstructTree(commit.exp)
		updateExp(commit.exp, false)
		activeModeIndex.value = commit.activeModeIndex
		modeState.value = commit.modeState

		return true
	}

	function tagExpHistory(tag: string) {
		if (history.length > 0) {
			history[history.length - 1].tag.add(tag)
		}
	}

	// Register to AppScope
	AppScope.def('revert-history', (arg: MalVal) => {
		if (typeof arg !== 'string') {
			return undoExp()
		} else {
			const tag = getName(arg)
			return undoExp(tag)
		}
	})

	AppScope.def('tag-history', (tag: MalVal) => {
		if (!(typeof tag === 'string' || MalKeyword.isType(tag))) {
			throw new MalError('tag is not a string/keyword')
		}
		tagExpHistory(getName(tag))
		return true
	})

	return {pushExpHistory, tagExpHistory}
}
