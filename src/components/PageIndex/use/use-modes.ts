import ConsoleScope from '@/scopes/console'
import {convertMalNodeToJSObject} from '@/mal/reader'
import {ref, Ref, computed, watch, markRaw} from '@vue/composition-api'
import {MalAtom, MalMap, assocBang, keywordFor, isMap} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import useMouseEvents from '@/components/use/use-mouse-events'
import AppScope from '@/scopes/app'

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
	const modes = ref(
		markRaw(
			convertMalNodeToJSObject(
				(ConsoleScope.var('*modes*') as MalAtom).value
			) as Mode[]
		)
	)

	let state: MalMap

	const {mouseX, mouseY, mousePressed} = useMouseEvents(handleEl, {
		onMove: () => executeMouseHandler('move'),
		onDown: () => executeMouseHandler('press'),
		onDrag: () => executeMouseHandler('drag'),
		onUp: () => executeMouseHandler('release'),
		ignorePredicate(e: MouseEvent) {
			// NOTE: This is makeshift and might occur bugs in the future
			// Ignore the click event when clicked handles directly
			return !/svg/i.test((e.target as any)?.tagName)
		},
	})

	const activeModeIndex: Ref<number | undefined> = ref(0)

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
				: ({} as MalMap)
			return true
		} else {
			return false
		}
	})

	watch(
		() => activeMode.value,
		mode => {
			if (mode) {
				state = mode.handlers.setup ? mode.handlers.setup() : ({} as MalMap)
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
