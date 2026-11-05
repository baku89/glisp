import { useElementSize } from '@vueuse/core'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import type { Height } from './floatHeight'
import { computed, type InjectionKey, type Ref, shallowRef, triggerRef } from 'vue'

import {
	acrossLine,
	activated,
	boxesOf,
	type Group,
	groupOf,
	heightOfStack,
	type Join,
	joinAt,
	joined,
	joinedUnder,
	merged,
	namesOf,
	normalized,
	type PanelBox,
	type PanelLayout,
	type PanelRect,
	placeAt,
	placed,
	raised,
	settled,
	type Side,
	type Size,
	type Stack,
	stackOf,
	tabbed,
	withFull,
} from './panelLayout'

/** A press does nothing but press, until it has gone this far. */
const DRAG_FROM = 4

/** What a panel gives for the layout to go by. */
export interface PanelHandle {
	readonly root: () => HTMLElement | null
	readonly width: Ref<number>
	readonly open: Ref<boolean>
	readonly height: Ref<Height>
	/** How tall what is in it comes to. */
	readonly naturalHeight: () => number
	readonly label: () => string
	readonly icon: () => string
	/** What is wrong with what is in it, to say on its tab. */
	readonly alert: () => string | null
	/** How tall it would be, away from anything that holds it to a height. */
	readonly freeHeight: () => number
}

export interface PanelTab {
	readonly name: string
	readonly label: string
	readonly icon: string
	readonly alert: string | null
	readonly active: boolean
}

export interface PanelDock {
	readonly boxes: Readonly<Ref<ReadonlyMap<string, PanelBox>>>
	readonly layout: Readonly<Ref<PanelLayout>>
	readonly held: Readonly<Ref<readonly string[]>>
	/** What the panel being held would join, if it were let go of now. */
	readonly joining: Readonly<Ref<Join | null>>
	register(name: string, handle: PanelHandle): void
	unregister(name: string): void
	measure(name: string, size: Size): void
	raise(name: string): void
	stackOf(name: string): Stack | undefined
	tabsOf(name: string): readonly PanelTab[]
	setWidth(name: string, width: number): void
	setFull(name: string, full: boolean, y?: Stack['y']): void
	/** Joins it to the next along the edge, with it taking up the room that is left. */
	merge(name: string, neighbor: string): void
	/** Moves its stack up or down, leaving the rest as it is. */
	setY(name: string, y: number): void
	/** What has to give way when this panel's end is moved, within its stack. */
	acrossLine(name: string, grows: 'down' | 'up'): PanelHandle | null
	/** Joins it under what is above it, as wide as that is. */
	joinUnder(name: string, above: string): void
	/** Opens or minimizes it, along with the tabs that it is among. */
	setOpen(name: string, open: boolean): void
	/** Brings it to the front of its tabs, as open or as minimized as they are. */
	activate(name: string): void
	/** Brings it to the front of its tabs, and opens them. */
	show(name: string): void
	/** Shows it, or minimizes it if it is showing. */
	toggle(name: string): void
	/** Whether it can be seen now, in full. */
	isShown(name: string): boolean
	/**
	 * Takes hold of a panel. By a tab of several, that is it alone. Otherwise it is its group, and
	 * all that go with it if that is at their top, unless `alone` says otherwise.
	 */
	grab(name: string, event: PointerEvent, options?: { readonly byTab?: boolean }): void
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
	const handles = shallowRef(new Map<string, PanelHandle>())
	const sizes = shallowRef(new Map<string, Size>())
	const held = shallowRef<readonly string[]>([])
	const joining = shallowRef<Join | null>(null)

	const boxes = computed(() =>
		boxesOf(layout.value, {
			sizes: sizes.value,
			stage: { width: stageWidth.value, height: stageHeight.value },
			held: held.value,
		})
	)

	/** Of what shows, as what does not has nowhere to be. */
	const rectsWithin = (origin: DOMRect): PanelRect[] =>
		[...handles.value].flatMap(([name, { root }]) => {
			if (groupOf(layout.value, name)?.active !== name) return []
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
		const stack = stackOf(layout.value, name)
		for (const panel of stack === undefined ? [name] : namesOf(stack.groups)) {
			const handle = handles.value.get(panel)
			if (handle !== undefined) handle.width.value = width
		}
	}

	const isOpen = (name: string): boolean => handles.value.get(name)?.open.value ?? false

	function setOpen(name: string, open: boolean): void {
		for (const tab of groupOf(layout.value, name)?.tabs ?? [name]) {
			const handle = handles.value.get(tab)
			if (handle !== undefined) handle.open.value = open
		}
	}

	function activate(name: string): void {
		layout.value = activated(layout.value, name)
	}

	function show(name: string): void {
		activate(name)
		setOpen(name, true)
	}

	const isShown = (name: string): boolean =>
		groupOf(layout.value, name)?.active === name && isOpen(name)

	/** What goes along with a panel taken hold of. */
	function heldBy(name: string, byTab: boolean, alt: boolean): readonly Group[] {
		const stack = stackOf(layout.value, name)
		const group = groupOf(layout.value, name)
		if (stack === undefined || group === undefined) return []
		if (byTab && group.tabs.length > 1) return [{ tabs: [name], active: name }]
		return stack.groups[0] === group && !alt ? stack.groups : [group]
	}

	function grab(name: string, event: PointerEvent, options?: { readonly byTab?: boolean }): void {
		const area = stage.value
		if (event.button !== 0 || area === null) return
		const groups = heldBy(name, options?.byTab ?? false, event.altKey)
		if (groups.length === 0) return
		const names = namesOf(groups)
		const { clientX, clientY, pointerId } = event
		let start: { readonly x: number; readonly y: number; readonly size: Size } | null = null

		function begin(): void {
			const origin = area!.getBoundingClientRect()
			// A tab that does not show comes away from where the one that does is.
			const shows = groups.map(({ active }) => groupOf(layout.value, active)?.active ?? active)
			const rects = rectsWithin(origin).filter(rect => shows.includes(rect.name))
			const left = Math.min(...rects.map(rect => rect.left))
			const right = Math.max(...rects.map(rect => rect.right))
			const top = Math.min(...rects.map(rect => rect.top))
			const height = heightOfStack(
				groups.map(({ active }) => handles.value.get(active)?.freeHeight() ?? 0)
			)
			start = { x: left, y: top, size: { width: right - left, height } }
			held.value = names
			// To what stays, as a tab being held can go from the panel that it was pressed in. Not
			// before it is a drag, as a click goes to what has the pointer.
			area!.setPointerCapture(pointerId)
		}

		const onMove = (move: PointerEvent) => {
			if (move.pointerId !== pointerId) return
			if (start === null) {
				if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < DRAG_FROM) return
				begin()
			}
			const { x, y, size } = start!
			const origin = area.getBoundingClientRect()
			const stageSize = { width: origin.width, height: origin.height }
			const place = placeAt(x + move.clientX - clientX, y + move.clientY - clientY, size, stageSize)
			layout.value = placed(layout.value, groups, place)
			joining.value = joinAt(
				move.clientX - origin.left,
				move.clientY - origin.top,
				layout.value,
				rectsWithin(origin),
				names
			)
		}

		const finish = (commit: boolean) => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onCancel)
			const join = joining.value
			if (commit && join !== null) {
				const target = handles.value.get(join.to)
				layout.value =
					join.kind === 'tab'
						? tabbed(layout.value, groups, join.to)
						: joined(layout.value, groups, join.to, join.at)
				if (target !== undefined) {
					setWidth(name, target.width.value)
					if (join.kind === 'tab') setOpen(name, target.open.value)
				}
			}
			if (commit && join === null && start !== null) layout.value = settled(layout.value, name)
			joining.value = null
			held.value = []
			if (start === null) return
			// A click comes after this, on what was only being held.
			const swallow = (click: Event) => click.stopImmediatePropagation()
			window.addEventListener('click', swallow, { capture: true, once: true })
			setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
		}
		const onUp = (up: PointerEvent) => {
			if (up.pointerId === pointerId) finish(true)
		}
		const onCancel = (cancel: PointerEvent) => {
			if (cancel.pointerId === pointerId) finish(false)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onCancel)
	}

	return {
		boxes,
		layout,
		held,
		joining,
		register(name, handle) {
			handles.value.set(name, handle)
			triggerRef(handles)
		},
		unregister(name) {
			handles.value.delete(name)
			triggerRef(handles)
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
		stackOf: name => stackOf(layout.value, name),
		tabsOf(name) {
			const group = groupOf(layout.value, name)
			return (group?.tabs ?? [name]).flatMap(tab => {
				const handle = handles.value.get(tab)
				if (handle === undefined) return []
				return [
					{
						name: tab,
						label: handle.label(),
						icon: handle.icon(),
						alert: handle.alert(),
						active: group?.active === tab,
					},
				]
			})
		},
		setWidth,
		setFull(name, full, y) {
			layout.value = withFull(layout.value, name, full, y)
		},
		merge(name, neighbor) {
			const width = handles.value.get(name)?.width.value
			layout.value = merged(layout.value, name, neighbor)
			if (width !== undefined) setWidth(name, width)
		},
		acrossLine(name, grows) {
			const across = acrossLine(layout.value, name, grows)
			return across === null ? null : (handles.value.get(across) ?? null)
		},
		setY(name, y) {
			const stack = stackOf(layout.value, name)
			if (stack !== undefined) layout.value = withFull(layout.value, name, stack.full, y)
		},
		joinUnder(name, above) {
			const width = handles.value.get(above)?.width.value
			layout.value = joinedUnder(layout.value, name, above)
			if (width !== undefined) setWidth(name, width)
		},
		setOpen,
		activate,
		show,
		toggle(name) {
			if (isShown(name)) setOpen(name, false)
			else show(name)
		},
		isShown,
		grab,
		taken(side) {
			const onEdge = layout.value.filter(stack => stack.side === side && stack.inset === 0)
			const widths = onEdge.flatMap(({ groups }) =>
				groups.map(({ active }) => sizes.value.get(active)?.width ?? 0)
			)
			return Math.max(0, ...widths)
		},
	}
}
