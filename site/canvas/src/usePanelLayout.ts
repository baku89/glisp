import { useElementSize } from '@vueuse/core'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import type { Height } from './floatHeight'
import { computed, type InjectionKey, type Ref, shallowRef, triggerRef } from 'vue'

import {
	acrossLine,
	activated,
	boxesOf,
	fillerOf,
	fitted,
	type Group,
	groupOf,
	heightOfStack,
	isUpright,
	type Join,
	joinAt,
	joined,
	joinedUnder,
	lengthOf,
	MIN_HEIGHT,
	merged,
	namesOf,
	normalized,
	type PanelBox,
	type Place,
	type PanelLayout,
	type PanelRect,
	placeAt,
	placed,
	raised,
	roomOf,
	settled,
	type Side,
	type Size,
	type Stack,
	stackOf,
	stamped,
	tabbed,
	thicknessOf,
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
	/** It is as large as what is in it says, as a toolbar is, and is no tab of anything. */
	readonly fixed?: boolean
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
	/** What is in the stack of a panel being resized, which goes by the pointer as that one does. */
	readonly resizing: Readonly<Ref<readonly string[]>>
	/** Says that the panel is being resized, or no longer is, with null. */
	resize(name: string | null): void
	/** What the panel being held would join, if it were let go of now. */
	readonly joining: Readonly<Ref<Join | null>>
	register(name: string, handle: PanelHandle): void
	unregister(name: string): void
	measure(name: string, size: Size): void
	raise(name: string): void
	stackOf(name: string): Stack | undefined
	tabsOf(name: string): readonly PanelTab[]
	setWidth(name: string, width: number): void
	/** How tall it is, and each that it is joined to across the top or the bottom. */
	setHeight(name: string, height: Height): void
	setFull(name: string, full: boolean, along?: Stack['along']): void
	/** Joins it to the next along the edge, with it taking up the room that is left. */
	merge(name: string, neighbor: string): void
	/** Moves its stack along its edge, leaving the rest as it is. */
	setAlong(name: string, along: number): void
	/** What has to give way when this panel's end is moved, within its stack. */
	acrossLine(name: string, grows: PanelBox['grows']): PanelHandle | null
	/** Joins it after what is before it, as thick as that is. */
	joinUnder(name: string, before: string): void
	/** Puts it at a place of its own, as a toolbar taken apart is put where it was let go of. */
	place(name: string, place: Place): void
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
	grab(
		name: string,
		event: PointerEvent,
		options?: { readonly byTab?: boolean; readonly onMove?: (event: PointerEvent) => void; readonly onEnd?: () => void }
	): void
	/** How much of the window the panels on an edge keep from the canvas. */
	taken(side: Side): number
}

export const PANEL_DOCK: InjectionKey<PanelDock> = Symbol('panel dock')

export function usePanelLayout(
	stage: Readonly<Ref<HTMLElement | null>>,
	key: string,
	defaults: PanelLayout,
	/** What can be there besides the defaults, as the toolbars are, with where each goes at first. */
	others: () => ReadonlyMap<string, Place> = () => new Map()
): PanelDock {
	const kept = useAppConfigStore().ref<unknown>(key, null)
	const layout = computed<PanelLayout>({
		get: () => normalized(kept.value, defaults, others()),
		set: value => (kept.value = value),
	})

	const { width: stageWidth, height: stageHeight } = useElementSize(stage)
	const handles = shallowRef(new Map<string, PanelHandle>())
	const sizes = shallowRef(new Map<string, Size>())
	const held = shallowRef<readonly string[]>([])
	const resizing = shallowRef<readonly string[]>([])
	const joining = shallowRef<Join | null>(null)

	const closed = computed(
		() => new Set([...handles.value].flatMap(([name, handle]) => (handle.open.value ? [] : [name])))
	)
	const boxes = computed(() =>
		boxesOf(layout.value, {
			sizes: sizes.value,
			stage: { width: stageWidth.value, height: stageHeight.value },
			held: held.value,
			closed: closed.value,
			fixed: new Set([...handles.value].flatMap(([name, handle]) => (handle.fixed ? [name] : []))),
		})
	)
	const isFixed = (name: string): boolean => handles.value.get(name)?.fixed ?? false

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
			if (handle !== undefined && !handle.fixed) handle.width.value = width
		}
	}

	function setHeight(name: string, height: Height): void {
		const stack = stackOf(layout.value, name)
		for (const panel of stack === undefined ? [name] : namesOf(stack.groups)) {
			const handle = handles.value.get(panel)
			if (handle !== undefined && !handle.fixed) handle.height.value = height
		}
	}

	/**
	 * Makes what is joined in the stack that has `name` fit along its edge, as one more joined to
	 * others that already go as far as there is room would go on past the end of the window.
	 */
	function fitStack(name: string): void {
		const stack = stackOf(layout.value, name)
		const measured = {
			sizes: sizes.value,
			stage: { width: stageWidth.value, height: stageHeight.value },
			closed: closed.value,
		}
		const room = roomOf(layout.value, measured, name)
		if (stack === undefined || room === null || stack.inset > 0) return
		const upright = isUpright(stack.side)
		const filler = fillerOf(stack, measured) ?? -1
		const handlesOf = stack.groups.map(({ active }) => handles.value.get(active))
		// What takes up the room left counts as the least it can be, and what is folded as its header.
		const lengths = handlesOf.map((handle, i) => {
			if (i === filler) return MIN_HEIGHT
			if (handle === undefined) return 0
			const size = sizes.value.get(stack.groups[i]!.active) ?? { width: 0, height: 0 }
			if (!handle.open.value || handle.fixed) return lengthOf(size, stack.side)
			return upright ? handle.freeHeight() : handle.width.value
		})
		const kept = handlesOf.map((handle, i) => i === filler || handle === undefined || handle.fixed === true || !handle.open.value)
		const next = fitted(lengths, room, kept)
		next.forEach((length, i) => {
			const handle = handlesOf[i]
			if (handle === undefined || kept[i] || length === lengths[i]) return
			if (upright) handle.height.value = length
			else handle.width.value = length
		})
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
		// What is as large as what is in it goes alone, as it has no top to take the rest by.
		if (isFixed(name)) return [group]
		return stack.groups[0] === group && !alt ? stack.groups : [group]
	}

	function grab(
		name: string,
		event: PointerEvent,
		options?: { readonly byTab?: boolean; readonly onMove?: (event: PointerEvent) => void; readonly onEnd?: () => void }
	): void {
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
			layout.value = stamped(layout.value, name)
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
				names,
				isFixed
			)
			options?.onMove?.(move)
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
				if (target !== undefined && !target.fixed) {
					setWidth(name, target.width.value)
					if (join.kind === 'tab') setOpen(name, target.open.value)
				}
				if (join.kind === 'stack') fitStack(name)
			}
			if (commit && join === null && start !== null) layout.value = settled(layout.value, name)
			joining.value = null
			held.value = []
			if (start === null) return
			options?.onEnd?.()
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
		resizing,
		resize(name) {
			const stack = name === null ? undefined : stackOf(layout.value, name)
			resizing.value = name === null ? [] : stack === undefined ? [name] : namesOf(stack.groups)
		},
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
		setHeight,
		setFull(name, full, along) {
			layout.value = withFull(layout.value, name, full, along)
		},
		merge(name, neighbor) {
			const width = isFixed(name) ? undefined : handles.value.get(name)?.width.value
			layout.value = merged(layout.value, name, neighbor)
			if (width !== undefined) setWidth(name, width)
		},
		acrossLine(name, grows) {
			const across = acrossLine(layout.value, name, grows)
			return across === null ? null : (handles.value.get(across) ?? null)
		},
		setAlong(name, along) {
			const stack = stackOf(layout.value, name)
			if (stack !== undefined) layout.value = withFull(layout.value, name, stack.full, along)
		},
		joinUnder(name, before) {
			const width = isFixed(before) ? undefined : handles.value.get(before)?.width.value
			layout.value = joinedUnder(layout.value, name, before)
			if (width !== undefined) setWidth(name, width)
		},
		place(name, place) {
			const group = groupOf(layout.value, name) ?? { tabs: [name], active: name }
			layout.value = placed(layout.value, [group], place)
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
			const thick = onEdge.flatMap(({ groups }) =>
				groups.map(({ active }) => thicknessOf(sizes.value.get(active) ?? { width: 0, height: 0 }, side))
			)
			return Math.max(0, ...thick)
		},
	}
}
