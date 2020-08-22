import ConsoleScope from '@/scopes/console'
import {convertMalNodeToJSObject} from '@/mal/reader'
import {ref, Ref, computed, watch} from '@vue/composition-api'
import {MalAtom, MalMap, assocBang, keywordFor} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import useMouseEvents from '@/components/use/use-mouse-events'

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
		convertMalNodeToJSObject(
			(ConsoleScope.var('*modes*') as MalAtom).value
		) as Mode[]
	)

	let state: MalMap

	const {mouseX, mouseY, mousePressed} = useMouseEvents(handleEl, {
		onMove: () => executeMouseHandler('move'),
		onDown: () => executeMouseHandler('press'),
		onDrag: () => executeMouseHandler('drag'),
		onUp: () => executeMouseHandler('release'),
	})

	const activeModeIndex: Ref<number | undefined> = ref(undefined)

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
			state = handler(
				assocBang(
					state,
					K_EVENT_TYPE,
					type,
					K_POS,
					pos.value,
					K_MOUSE_PRESSED,
					mousePressed.value
				)
			)
		}
	}

	// Execute setup
	watch(
		() => activeMode.value,
		mode => {
			if (mode && mode.handlers.setup) {
				state = mode.handlers.setup()
			}
		}
	)

	return {
		modes,
		activeModeIndex,
		activeMode,
	}
}
