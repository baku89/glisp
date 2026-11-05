import { useElementSize } from '@vueuse/core'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { computed, type InjectionKey, type Ref, shallowRef, triggerRef } from 'vue'

import {
	boxesOf,
	heightOfStack,
	type Join,
	joinAt,
	joined,
	normalized,
	type PanelBox,
	type PanelLayout,
	type PanelRect,
	placeAt,
	placed,
	raised,
	type Side,
	type Size,
	type Stack,
	withFull,
} from './panelLayout'

/** A press does nothing but press, until it has gone this far. */
const DRAG_FROM = 4

/** What a panel gives for the layout to go by. */
export interface PanelHandle {
	readonly root: () => HTMLElement | null
	readonly width: Ref<number>
	/** How tall it would be, away from anything that holds it to a height. */
	readonly freeHeight: () => number
}

export interface PanelDock {
	readonly boxes: Readonly<Ref<ReadonlyMap<string, PanelBox>>>
	readonly layout: Readonly<Ref<PanelLayout>>
	readonly held: Readonly<Ref<readonly string[]>>
	/** Where the panel being held would join, if it were let go of now. */
	readonly joining: Readonly<Ref<Join | null>>
	register(name: string, handle: PanelHandle): void
	unregister(name: string): void
	measure(name: string, size: Size): void
	raise(name: string): void
	stackOf(name: string): Stack | undefined
	setWidth(name: string, width: number): void
	setFull(name: string, full: boolean, y?: Stack['y']): void
	/** Takes hold of a panel: of it alone, or of all that go with it if it is at their top. */
	grab(name: string, event: PointerEvent, handle: HTMLElement): void
	/** How much of the window the panels on an edge keep from the canvas. */
	taken(side: Side): number
}

export const PANEL_DOCK: InjectionKey<PanelDock> = Symbol('panel dock')

export function usePanelLayout(
	stage: Readonly<Ref<HTMLElement | null>>,
	key: string,
	defaults: PanelLayout
): PanelDock {
	const kept = useAppConfigStore().ref<unknown>(key, null)
	const layout = computed<PanelLayout>({
		get: () => normalized(kept.value, defaults),
		set: value => (kept.value = value),
	})

	const { width: stageWidth, height: stageHeight } = useElementSize(stage)
	const handles = new Map<string, PanelHandle>()
	const sizes = shallowRef(new Map<string, Size>())
	const held = shallowRef<readonly string[]>([])
	const joining = shallowRef<Join | null>(null)

	const boxes = computed(() =>
		boxesOf(layout.value, {
			sizes: sizes.value,
			stage: { width: stageWidth.value, height: stageHeight.value },
		})
	)

	const stackOf = (name: string): Stack | undefined =>
		layout.value.find(({ panels }) => panels.includes(name))

	const rectsWithin = (origin: DOMRect): PanelRect[] =>
		[...handles].flatMap(([name, { root }]) => {
			const rect = root()?.getBoundingClientRect()
			if (rect === undefined) return []
			return [
				{
					name,
					left: rect.left - origin.left,
					top: rect.top - origin.top,
					right: rect.right - origin.left,
					bottom: rect.bottom - origin.top,
				},
			]
		})

	function setWidth(name: string, width: number): void {
		for (const panel of stackOf(name)?.panels ?? [name]) {
			const handle = handles.get(panel)
			if (handle !== undefined) handle.width.value = width
		}
	}

	function grab(name: string, event: PointerEvent, handle: HTMLElement): void {
		const area = stage.value
		const stack = stackOf(name)
		if (event.button !== 0 || area === null || stack === undefined) return
		const { clientX, clientY, pointerId } = event
		const names = stack.panels[0] === name && !event.altKey ? stack.panels : [name]
		let start: { readonly x: number; readonly y: number; readonly size: Size } | null = null
		// From the press, as a quick drag would be off of it before the first move comes.
		handle.setPointerCapture(pointerId)

		function begin(): void {
			const origin = area!.getBoundingClientRect()
			const rects = rectsWithin(origin).filter(rect => names.includes(rect.name))
			const left = Math.min(...rects.map(rect => rect.left))
			const right = Math.max(...rects.map(rect => rect.right))
			const top = Math.min(...rects.map(rect => rect.top))
			const height = heightOfStack(names.map(panel => handles.get(panel)?.freeHeight() ?? 0))
			start = { x: left, y: top, size: { width: right - left, height } }
			held.value = names
		}

		const onMove = (move: PointerEvent) => {
			if (start === null) {
				if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < DRAG_FROM) return
				begin()
			}
			const { x, y, size } = start!
			const origin = area.getBoundingClientRect()
			const stageSize = { width: origin.width, height: origin.height }
			const place = placeAt(x + move.clientX - clientX, y + move.clientY - clientY, size, stageSize)
			layout.value = placed(layout.value, names, place)
			joining.value = joinAt(
				move.clientX - origin.left,
				move.clientY - origin.top,
				layout.value,
				rectsWithin(origin),
				names
			)
		}

		const finish = (commit: boolean) => {
			handle.removeEventListener('pointermove', onMove)
			handle.removeEventListener('pointerup', onUp)
			handle.removeEventListener('pointercancel', onCancel)
			const join = joining.value
			if (commit && join !== null) {
				const width = handles.get(join.to)?.width.value
				layout.value = joined(layout.value, names, join.to, join.at)
				if (width !== undefined) setWidth(name, width)
			}
			joining.value = null
			held.value = []
			if (start === null) return
			// A click comes after this, on what was only being held.
			const swallow = (click: Event) => click.stopImmediatePropagation()
			handle.addEventListener('click', swallow, { capture: true, once: true })
			setTimeout(() => handle.removeEventListener('click', swallow, { capture: true }))
		}
		const onUp = () => finish(true)
		const onCancel = () => finish(false)
		handle.addEventListener('pointermove', onMove)
		handle.addEventListener('pointerup', onUp)
		handle.addEventListener('pointercancel', onCancel)
	}

	return {
		boxes,
		layout,
		held,
		joining,
		register(name, handle) {
			handles.set(name, handle)
		},
		unregister(name) {
			handles.delete(name)
		},
		measure(name, size) {
			const was = sizes.value.get(name)
			if (was?.width === size.width && was.height === size.height) return
			sizes.value.set(name, size)
			triggerRef(sizes)
		},
		raise(name) {
			const next = raised(layout.value, name)
			if (next !== layout.value) layout.value = next
		},
		stackOf,
		setWidth,
		setFull(name, full, y) {
			layout.value = withFull(layout.value, name, full, y)
		},
		grab,
		taken(side) {
			const onEdge = layout.value.filter(stack => stack.side === side && stack.inset === 0)
			const widths = onEdge.flatMap(({ panels }) => panels.map(name => sizes.value.get(name)?.width ?? 0))
			return Math.max(0, ...widths)
		},
	}
}
