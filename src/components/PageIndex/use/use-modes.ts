import {mat2d, vec2} from 'linearly'
import {computed, Ref, ref, watch} from 'vue'

import useMouseEvents from '@/components/use/use-mouse-events'
import {assocBang, ExprAtom, ExprMap, isMap, keywordFor} from '@/glisp'
import AppScope from '@/scopes/app'
import ConsoleScope from '@/scopes/console'
import {getHTMLElement} from '@/utils'

const K_EVENT_TYPE = keywordFor('event-type')
const K_POS = keywordFor('pos')
const K_MOUSE_PRESSED = keywordFor('mouse-pressed')

interface Mode {
	name: string
	handlers: {
		label: string
		icon: {type: 'character' | 'fontawesome'; value: string}
		setup?: () => ExprMap
		move?: (state: ExprMap) => ExprMap
		press?: (state: ExprMap) => ExprMap
		drag?: (state: ExprMap) => ExprMap
		release?: (state: ExprMap) => ExprMap
	}
}

export function useModes(
	handleEl: Ref<HTMLElement | null>,
	viewTransform: Ref<mat2d>
) {
	// Force enable keyboard state to retrieve modifiers

	const modes = ref((ConsoleScope.var('*modes*') as ExprAtom).value as Mode[])

	let state: ExprMap

	const {mouseX, mouseY, mousePressed} = useMouseEvents(handleEl, {
		onMove: () => executeMouseHandler('move'),
		onDown: () => executeMouseHandler('press'),
		onDrag: () => executeMouseHandler('drag'),
		onUp: () => executeMouseHandler('release'),
		ignorePredicate(e: MouseEvent) {
			const root = getHTMLElement(handleEl)
			if (!root) return true
			const target = e.target as HTMLElement
			// NOTE: Makeshift
			const svg = root.children[1]
			return target !== svg && svg.contains(target)
		},
	})

	const activeModeIndex: Ref<number | undefined> = ref(0)

	const activeMode = computed(() =>
		activeModeIndex.value !== undefined
			? modes.value[activeModeIndex.value]
			: undefined
	)

	const pos = computed(() => {
		return vec2.transformMat2d(
			[mouseX.value, mouseY.value],
			mat2d.invert(viewTransform.value) ?? mat2d.ident
		)
	})

	function executeMouseHandler(type: 'move' | 'press' | 'drag' | 'release') {
		if (!activeMode.value) return

		const handler = activeMode.value.handlers[type]
		if (handler) {
			const params = assocBang(
				state,
				K_EVENT_TYPE,
				type,
				K_POS,
				pos.value,
				K_MOUSE_PRESSED,
				mousePressed.value
			)
			const updatedState = handler(params)
			if (isMap(updatedState)) {
				state = updatedState
			}
		}
	}

	// Execute setup
	AppScope.def('reset-mode', () => {
		if (activeMode.value) {
			state = activeMode.value.handlers.setup
				? activeMode.value.handlers.setup()
				: ({} as ExprMap)
			return true
		} else {
			return false
		}
	})

	watch(
		() => activeMode.value,
		mode => {
			if (mode) {
				state = mode.handlers.setup ? mode.handlers.setup() : ({} as ExprMap)
			}
		},
		{immediate: true}
	)

	return {
		modes,
		activeModeIndex,
		activeMode,
	}
}
