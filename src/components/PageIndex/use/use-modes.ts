import ConsoleScope from '@/scopes/console'
import {ref, Ref, computed, watch} from 'vue'
import {MalBoolean, MalKeyword, MalMap, MalString} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import useMouseEvents from '@/components/use/use-mouse-events'
import AppScope from '@/scopes/app'
import {useKeyboardState} from '@/components/use'
import {getHTMLElement} from '@/utils'
import {jsToMal} from '@/mal/reader'

const K_EVENT_TYPE = MalKeyword.create('event-type')
const K_POS = MalKeyword.create('pos')
const K_MOUSE_PRESSED = MalKeyword.create('mouse-pressed')

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
		modes.value = (ConsoleScope.var('*modes*').toJS() as any) as Mode[]
	}

	const modeState = ref<MalMap>(MalMap.create())

	const {mouseX, mouseY, mousePressed} = useMouseEvents(handleEl, {
		onMove: () => executeMouseHandler('move'),
		onDown: () => executeMouseHandler('press'),
		onDrag: () => executeMouseHandler('drag'),
		onUp: () => executeMouseHandler('release'),
		ignorePredicate(e: MouseEvent) {
			const root = getHTMLElement(handleEl)
			if (!root) return true
			const target = e.target
			const svg = root.querySelector('svg')
			return (
				svg !== null && target !== svg && svg.contains(target as Node | null)
			)
		},
	})

	const activeModeIndex = ref<number | undefined>(0)

	const activeMode = computed(() =>
		activeModeIndex.value !== undefined
			? modes.value[activeModeIndex.value]
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
			const params = modeState.value.assoc(
				K_EVENT_TYPE,
				MalString.create(type),
				K_POS,
				jsToMal(pos.value),
				K_MOUSE_PRESSED,
				MalBoolean.create(mousePressed.value)
			)

			const updatedState = handler(params)
			if (MalMap.is(updatedState)) {
				modeState.value = updatedState as any
			}
		}
	}

	// Execute setup
	AppScope.defn('reset-mode', () => {
		if (activeMode.value) {
			modeState.value = activeMode.value.handlers.setup
				? activeMode.value.handlers.setup()
				: ({} as any)

			return MalBoolean.create(true)
		} else {
			return MalBoolean.create(false)
		}
	})

	watch(
		() => activeMode.value,
		mode => {
			if (mode) {
				modeState.value = mode.handlers.setup
					? mode.handlers.setup()
					: ({} as any)
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
