import {Ref} from 'vue'

import {MalBoolean, MalColl, MalError, MalMap, MalVal} from '@/mal/types'
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
	AppScope.defn('revert-history', (tag: MalVal) => {
		return MalBoolean.from(
			undoExp(typeof tag.value === 'string' ? tag.value : undefined)
		)
	})

	AppScope.defn('tag-history', (tag: MalVal) => {
		if (typeof tag.value !== 'string') {
			throw new MalError('tag is not a string/keyword/symbol')
		}
		tagExpHistory(tag.value)
		return MalBoolean.from(true)
	})

	return {pushExpHistory, tagExpHistory}
}
