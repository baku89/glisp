import ConsoleScope from '@/scopes/console'
import {convertMalNodeToJSObject} from '@/mal/reader'
import {ref, Ref, computed, watch, markRaw} from 'vue'
import {MalAtom, MalMap, assocBang, keywordFor, isMap} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import useMouseEvents from '@/components/use/use-mouse-events'
import AppScope from '@/scopes/app'
import {useKeyboardState} from '@/components/use'
import {getHTMLElement, nonReactive, NonReactive} from '@/utils'

const K_EVENT_TYPE = keywordFor('event-type')
const K_POS = keywordFor('pos')
const K_MOUSE_PRESSED = keywordFor('mouse-pressed')

interface Mode {
	name: string
	handlers: {
		label: string
		icon: {type: 'character' | 'fontawesome'; value: string}
		setup?: () => MalMap
		move?: (state: MalMap) => MalMap
		press?: (state: MalMap) => MalMap
		drag?: (state: MalMap) => MalMap
		release?: (state: MalMap) => MalMap
	}
}

export function useModes(
	handleEl: Ref<HTMLElement | null>,
	viewTransform: Ref<mat2d>
) {
	// Force enable keyboard state to retrieve modifiers
	useKeyboardState()

	const modes = ref<Mode[]>([])

	function setupModes() {
		modes.value = markRaw(
			convertMalNodeToJSObject(
				(ConsoleScope.var('*modes*') as MalAtom).value
			) as Mode[]
		)
	}

	const modeState = ref<NonReactive<MalMap>>(nonReactive({}))

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

	const activeModeIndex = ref<number | undefined>(0)

	const activeMode = computed(() =>
		activeModeIndex.value !== undefined
			? markRaw(modes.value[activeModeIndex.value])
			: undefined
	)

	const pos = computed(() => {
		const pos = vec2.fromValues(mouseX.value, mouseY.value)
		vec2.transformMat2d(
			pos,
			pos,
			mat2d.invert(mat2d.create(), viewTransform.value)
		)
		return pos
	})

	function executeMouseHandler(type: 'move' | 'press' | 'drag' | 'release') {
		if (!activeMode.value) return

		const handler = activeMode.value.handlers[type]
		if (handler) {
			const params = assocBang(
				modeState.value.value as any,
				K_EVENT_TYPE,
				type,
				K_POS,
				pos.value,
				K_MOUSE_PRESSED,
				mousePressed.value
			)
			const updatedState = handler(params)
			if (isMap(updatedState)) {
				modeState.value = nonReactive(updatedState) as any
			}
		}
	}

	// Execute setup
	AppScope.def('reset-mode', () => {
		if (activeMode.value) {
			modeState.value = nonReactive(
				activeMode.value.handlers.setup
					? activeMode.value.handlers.setup()
					: ({} as any)
			)
			return true
		} else {
			return false
		}
	})

	watch(
		() => activeMode.value,
		mode => {
			if (mode) {
				modeState.value = nonReactive(
					mode.handlers.setup ? mode.handlers.setup() : ({} as any)
				)
			}
		},
		{immediate: true}
	)

	return {
		modes,
		modeState,
		activeModeIndex,
		activeMode,
		setupModes,
	}
}
