import {unrefElement} from '@vueuse/core'
import hotkeys from 'hotkeys-js'
import isElectron from 'is-electron'
import {onMounted, Ref} from 'vue'

interface UseGestureOptions {
	onScroll?: (e: WheelEvent) => any
	onGrab?: (e: WheelEvent) => any
	onZoom?: (e: WheelEvent) => any
	onRotate?: (e: {rotation: number; pageX: number; pageY: number}) => any
}

export default function useGesture(
	el: Ref<Element | null>,
	options: UseGestureOptions
) {
	const isWindows = /win/i.test(navigator.platform)

	onMounted(() => {
		if (!el.value) return

		const _el: HTMLElement = unrefElement(el)

		if (options.onScroll || options.onZoom) {
			// Wheel scrolling
			_el.addEventListener('wheel', (e: WheelEvent) => {
				if (e.altKey || e.ctrlKey) {
					if (options.onZoom) {
						e.preventDefault()
						e.stopPropagation()
						if (isWindows) {
							e = {
								pageX: e.pageX,
								pageY: e.pageY,
								deltaY: e.deltaY / 10,
							} as WheelEvent
						}
						options.onZoom(e)
					}
				} else {
					if (options.onScroll) {
						e.preventDefault()
						e.stopPropagation()
						options.onScroll(e)
					}
				}
			})
		}

		if (options.onGrab) {
			const onGrab = options.onGrab
			let prevX: number, prevY: number

			const onGrabMove = (_e: MouseEvent) => {
				const e = {
					deltaX: _e.pageX - prevX,
					deltaY: _e.pageY - prevY,
				} as WheelEvent

				prevX = _e.pageX
				prevY = _e.pageY
				onGrab(e)
			}

			const onGrabEnd = () => {
				_el.removeEventListener('mousemove', onGrabMove)
				document.documentElement.style.cursor = 'default'
			}

			// Middle-button/space translation
			_el.addEventListener('mousedown', (e: MouseEvent) => {
				if (e.button === 1 || hotkeys.isPressed('space')) {
					prevX = e.pageX
					prevY = e.pageY

					_el.addEventListener('mousemove', onGrabMove)
					_el.addEventListener('mouseup', onGrabEnd)
					document.documentElement.style.cursor = 'grab'
				}
			})

			// Toggle cursor on pressing space
			hotkeys('space', {keydown: true, keyup: true}, e => {
				e.preventDefault()
				e.stopPropagation()

				if (e.type === 'keydown') {
					document.documentElement.style.cursor = 'grab'
				} else if (e.type === 'keyup') {
					document.documentElement.style.cursor = 'default'
				}
			})

			// Rotation (only enabled in macos electron)
			if (options.onRotate && isElectron()) {
				const onRotate = options.onRotate
				const ipc = eval("require('electron').ipcRenderer")
				let pageX = 0,
					pageY = 0

				window.addEventListener('mousemove', e => {
					pageX = e.pageX
					pageY = e.pageY
				})

				ipc.on('rotate-gesture', (e: any, rotation: number) => {
					// const {x, y} = GetCursorPosition()
					onRotate({rotation, pageX, pageY})
				})
			}
		}
	})
}
