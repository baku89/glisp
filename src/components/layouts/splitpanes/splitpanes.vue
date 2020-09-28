<template>
	<div
		class="splitpanes"
		ref="container"
		:class="{
			[`splitpanes--${horizontal ? 'horizontal' : 'vertical'}`]: true,
			'splitpanes--dragging': touch.dragging,
		}"
	>
		<slot />
	</div>
</template>

<script lang="ts">
import {
	computed,
	defineComponent,
	nextTick,
	onMounted,
	onUnmounted,
	provide,
	reactive,
	ref,
	toRefs,
	watch,
} from 'vue'

interface PaneInfo {
	id: string
	index: number
	min: number
	max: number
	size: number | null
	givenSize: number
}

interface PaneSums {
	prevPanesSize: number
	nextPanesSize: number
	prevReachedMinPanes: number
	nextReachedMinPanes: number
}

export default defineComponent({
	name: 'splitpanes',
	props: {
		horizontal: {type: Boolean, default: false},
		pushOtherPanes: {type: Boolean, default: true},
		dblClickSplitter: {type: Boolean, default: true},
		firstSplitter: {type: Boolean, default: false},
	},
	setup(props, context) {
		const container = ref<null | HTMLElement>(null)

		const data = reactive({
			ready: false,
			panes: [] as PaneInfo[],
			touch: {
				mouseDown: false,
				dragging: false,
				activeSplitter: null as number | null,
			},
			splitterTaps: {
				// Used to detect double click on touch devices.
				splitter: null as number | null,
				timeoutId: null as NodeJS.Timeout | null,
			},
		})

		const panesCount = computed(() => data.panes.length)
		// Indexed panes by `_uid` of Pane components for fast lookup.
		// Every time a pane is destroyed this index is recomputed.
		const indexedPanes = computed(() =>
			data.panes.reduce(
				(obj, pane) => (obj[pane.id] = pane) && obj,
				{} as {[id: string]: PaneInfo}
			)
		)

		// Functions
		function checkSplitpanesNodes() {
			if (!container.value) return

			const children = Array.from(container.value.children)
			children.forEach(child => {
				const isPane = child.classList.contains('splitpanes__pane')
				const isSplitter = child.classList.contains('splitpanes__splitter')
				// Node is not a Pane or a splitter: remove it.
				if (!isPane && !isSplitter) {
					child.remove()
					console.warn(
						'Splitpanes: Only <pane> elements are allowed at the root of <splitpanes>. One of your DOM nodes was removed.'
					)
					return
				}
			})
		}

		function redoSplitters() {
			if (!container.value) return

			const children = Array.from(container.value.children)
			children.forEach(el => {
				if (el.className.includes('splitpanes__splitter')) removeSplitter(el)
			})
			let paneIndex = 0
			children.forEach(el => {
				if (el.className.includes('splitpanes__pane')) {
					if (!paneIndex && props.firstSplitter)
						addSplitter(paneIndex, el, true)
					else if (paneIndex) addSplitter(paneIndex, el)
					paneIndex++
				}
			})
		}

		function updatePaneComponents() {
			// Array.from(this.$children).forEach(paneComponent => {
			// 	paneComponent.update({
			// 		// Panes are indexed by Pane component _uid, as they might be inserted at different index!
			// 		[props.horizontal ? 'height' : 'width']: `${
			// 			data.indexedPanes[paneComponent._uid].size
			// 		}%`,
			// 	})
			// })
		}

		function bindEvents() {
			document.addEventListener('mousemove', onMouseMove, {passive: false})
			document.addEventListener('mouseup', onMouseUp)
			// Passive: false to prevent scrolling while touch dragging.
			if ('ontouchstart' in window) {
				document.addEventListener('touchmove', onMouseMove, {
					passive: false,
				})
				document.addEventListener('touchend', onMouseUp)
			}
		}

		function unbindEvents() {
			document.removeEventListener('mousemove', onMouseMove)
			document.removeEventListener('mouseup', onMouseUp)
			if ('ontouchstart' in window) {
				document.removeEventListener('touchmove', onMouseMove)
				document.removeEventListener('touchend', onMouseUp)
			}
		}

		function onMouseDown(event: MouseEvent, splitterIndex: number) {
			bindEvents()
			data.touch.mouseDown = true
			data.touch.activeSplitter = splitterIndex
		}

		function onMouseMove(event: Event) {
			if (data.touch.mouseDown) {
				// Prevent scrolling while touch dragging (only works with an active event, eg. passive: false).
				event.preventDefault()
				data.touch.dragging = true
				calculatePanesSize(getCurrentMouseDrag(event as MouseEvent))
				context.emit(
					'resize',
					data.panes.map(pane => ({
						min: pane.min,
						max: pane.max,
						size: pane.size,
					}))
				)
			}
		}

		function onMouseUp() {
			if (data.touch.dragging) {
				context.emit(
					'resized',
					data.panes.map(pane => ({
						min: pane.min,
						max: pane.max,
						size: pane.size,
					}))
				)
			}
			data.touch.mouseDown = false
			// Keep dragging flag until click event is finished (click happens immediately after mouseup)
			// in order to prevent emitting `splitter-click` event if splitter was dragged.
			setTimeout(() => {
				data.touch.dragging = false
				unbindEvents()
			}, 100)
		}
		// If touch device, detect double tap manually (2 taps separated by less than 500ms).
		function onSplitterClick(event: MouseEvent, splitterIndex: number) {
			if ('ontouchstart' in window) {
				event.preventDefault()
				if (data.splitterTaps.splitter === splitterIndex) {
					if (data.splitterTaps.timeoutId !== null)
						clearTimeout(data.splitterTaps.timeoutId)
					data.splitterTaps.timeoutId = null
					onSplitterDblClick(event, splitterIndex)
				} else {
					data.splitterTaps.splitter = splitterIndex
					data.splitterTaps.timeoutId = setTimeout(() => {
						data.splitterTaps.splitter = null
					}, 500)
				}
			}
			if (!data.touch.dragging)
				context.emit('splitter-click', data.panes[splitterIndex])
		}

		// On splitter dbl click or dbl tap maximize this pane.
		function onSplitterDblClick(event: MouseEvent, splitterIndex: number) {
			let totalMinSizes = 0
			data.panes = data.panes.map((pane, i) => {
				pane.size = i === splitterIndex ? pane.max : pane.min
				if (i !== splitterIndex) totalMinSizes += pane.min
				return pane
			})
			const pane = data.panes[splitterIndex]
			if (pane.size !== null) {
				pane.size -= totalMinSizes
			}
			context.emit('pane-maximize', data.panes[splitterIndex])
		}

		function onPaneClick(event: MouseEvent, paneIndex: number) {
			context.emit('pane-click', data.panes[paneIndex])
		}
		// Get the cursor position relative to the splitpane container.
		function getCurrentMouseDrag(event: MouseEvent | TouchEvent) {
			if (!container.value) return {x: 0, y: 0}

			const rect = container.value.getBoundingClientRect()
			const {clientX, clientY} = 'touches' in event ? event.touches[0] : event
			return {
				x: clientX - rect.left,
				y: clientY - rect.top,
			}
		}

		// Returns the drag percentage of the splitter relative to the 2 panes it's inbetween.
		// if the sum of size of the 2 cells is 60%, the dragPercentage range will be 0 to 100% of this 60%.
		function getCurrentDragPercentage(_drag: {x: number; y: number}) {
			if (!container.value) return 0

			const drag = _drag[props.horizontal ? 'y' : 'x']
			// In the code bellow 'size' refers to 'width' for vertical and 'height' for horizontal layout.
			const containerSize =
				container.value[props.horizontal ? 'clientHeight' : 'clientWidth']
			return (drag * 100) / containerSize
		}
		function calculatePanesSize(drag: {x: number; y: number}) {
			const splitterIndex = data.touch.activeSplitter
			if (splitterIndex === null) return

			let sums: PaneSums = {
				prevPanesSize: sumPrevPanesSize(splitterIndex),
				nextPanesSize: sumNextPanesSize(splitterIndex),
				prevReachedMinPanes: 0,
				nextReachedMinPanes: 0,
			}
			const minDrag = 0 + (props.pushOtherPanes ? 0 : sums.prevPanesSize)
			const maxDrag = 100 - (props.pushOtherPanes ? 0 : sums.nextPanesSize)
			const dragPercentage = Math.max(
				Math.min(getCurrentDragPercentage(drag), maxDrag),
				minDrag
			)
			// If not pushing other panes, panes to resize are right before and right after splitter.
			let panesToResize = [splitterIndex, splitterIndex + 1]
			let paneBefore = data.panes[panesToResize[0]] || null
			let paneAfter = data.panes[panesToResize[1]] || null
			const paneBeforeMaxReached =
				paneBefore.max < 100 &&
				dragPercentage >= paneBefore.max + sums.prevPanesSize
			const paneAfterMaxReached =
				paneAfter.max < 100 &&
				dragPercentage <=
					100 - (paneAfter.max + sumNextPanesSize(splitterIndex + 1))
			// Prevent dragging beyond pane max.
			if (paneBeforeMaxReached || paneAfterMaxReached) {
				if (paneBeforeMaxReached) {
					paneBefore.size = paneBefore.max
					paneAfter.size = Math.max(
						100 - paneBefore.max - sums.prevPanesSize - sums.nextPanesSize,
						0
					)
				} else {
					paneBefore.size = Math.max(
						100 -
							paneAfter.max -
							sums.prevPanesSize -
							sumNextPanesSize(splitterIndex + 1),
						0
					)
					paneAfter.size = paneAfter.max
				}
				return
			}
			// When pushOtherPanes = true, find the closest expanded pane on each side of the splitter.
			if (props.pushOtherPanes) {
				const vars = doPushOtherPanes(sums, dragPercentage)
				if (!vars) return // Prevent other calculation.
				;({sums, panesToResize} = vars)
				paneBefore = data.panes[panesToResize[0]] || null
				paneAfter = data.panes[panesToResize[1]] || null
			}
			if (paneBefore !== null) {
				paneBefore.size = Math.min(
					Math.max(
						dragPercentage - sums.prevPanesSize - sums.prevReachedMinPanes,
						paneBefore.min
					),
					paneBefore.max
				)
			}
			if (paneAfter !== null) {
				paneAfter.size = Math.min(
					Math.max(
						100 -
							dragPercentage -
							sums.nextPanesSize -
							sums.nextReachedMinPanes,
						paneAfter.min
					),
					paneAfter.max
				)
			}
		}

		function doPushOtherPanes(sums: PaneSums, dragPercentage: number) {
			const splitterIndex = data.touch.activeSplitter
			if (splitterIndex === null) return null

			const panesToResize = [splitterIndex, splitterIndex + 1]
			// Pushing Down.
			// Going smaller than the current pane min size: take the previous expanded pane.
			if (
				dragPercentage <
				sums.prevPanesSize + data.panes[panesToResize[0]].min
			) {
				panesToResize[0] = findPrevExpandedPane(splitterIndex).index
				sums.prevReachedMinPanes = 0
				// If pushing a n-2 or less pane, from splitter, then make sure all in between is at min size.
				if (panesToResize[0] < splitterIndex) {
					data.panes.forEach((pane, i) => {
						if (i > panesToResize[0] && i <= splitterIndex) {
							pane.size = pane.min
							sums.prevReachedMinPanes += pane.min
						}
					})
				}
				sums.prevPanesSize = sumPrevPanesSize(panesToResize[0])
				// If nothing else to push down, cancel dragging.
				if (panesToResize[0] === undefined) {
					sums.prevReachedMinPanes = 0
					data.panes[0].size = data.panes[0].min
					data.panes.forEach((pane, i) => {
						if (i > 0 && i <= splitterIndex) {
							pane.size = pane.min
							sums.prevReachedMinPanes += pane.min
						}
					})
					data.panes[panesToResize[1]].size =
						100 -
						sums.prevReachedMinPanes -
						data.panes[0].min -
						sums.prevPanesSize -
						sums.nextPanesSize
					return null
				}
			}
			// Pushing Up.
			// Pushing up beyond min size is reached: take the next expanded pane.
			if (
				dragPercentage >
				100 - sums.nextPanesSize - data.panes[panesToResize[1]].min
			) {
				panesToResize[1] = findNextExpandedPane(splitterIndex).index
				sums.nextReachedMinPanes = 0
				// If pushing a n+2 or more pane, from splitter, then make sure all in between is at min size.
				if (panesToResize[1] > splitterIndex + 1) {
					data.panes.forEach((pane, i) => {
						if (i > splitterIndex && i < panesToResize[1]) {
							pane.size = pane.min
							sums.nextReachedMinPanes += pane.min
						}
					})
				}
				sums.nextPanesSize = sumNextPanesSize(panesToResize[1] - 1)
				// If nothing else to push up, cancel dragging.
				if (panesToResize[1] === undefined) {
					sums.nextReachedMinPanes = 0
					data.panes[panesCount.value - 1].size =
						data.panes[panesCount.value - 1].min
					data.panes.forEach((pane, i) => {
						if (i < panesCount.value - 1 && i >= splitterIndex + 1) {
							pane.size = pane.min
							sums.nextReachedMinPanes += pane.min
						}
					})
					data.panes[panesToResize[0]].size =
						100 -
						sums.prevPanesSize -
						sums.nextReachedMinPanes -
						data.panes[panesCount.value - 1].min -
						sums.nextPanesSize
					return null
				}
			}
			return {sums, panesToResize}
		}

		function sumPrevPanesSize(splitterIndex: number) {
			return data.panes.reduce(
				(total, pane, i) => total + (i < splitterIndex ? pane.size || 0 : 0),
				0
			)
		}

		function sumNextPanesSize(splitterIndex: number) {
			return data.panes.reduce(
				(total, pane, i) =>
					total + (i > splitterIndex + 1 ? pane.size || 0 : 0),
				0
			)
		}

		// Return the previous pane from siblings which has a size (width for vert or height for horz) of more than 0.
		function findPrevExpandedPane(splitterIndex: number) {
			const pane = [...data.panes]
				.reverse()
				.find(p => p.index < splitterIndex && p.size !== null && p.size > p.min)
			return pane || null
		}

		// Return the next pane from siblings which has a size (width for vert or height for horz) of more than 0.
		function findNextExpandedPane(splitterIndex: number) {
			const pane = data.panes.find(
				p => p.index > splitterIndex + 1 && p.size !== null && p.size > p.min
			)
			return pane || null
		}

		function addSplitter(
			paneIndex: number,
			nextPaneNode: HTMLElement,
			isVeryFirst = false
		) {
			const splitterIndex = paneIndex - 1
			const elm = document.createElement('div')
			elm.classList.add('splitpanes__splitter')
			if (!isVeryFirst) {
				elm.onmousedown = event => onMouseDown(event, splitterIndex)
				if (typeof window !== 'undefined' && 'ontouchstart' in window) {
					elm.ontouchstart = event => onMouseDown(event, splitterIndex)
				}
				elm.onclick = event => onSplitterClick(event, splitterIndex + 1)
			}
			if (props.dblClickSplitter) {
				elm.ondblclick = event => onSplitterDblClick(event, splitterIndex + 1)
			}
			nextPaneNode.parentNode.insertBefore(elm, nextPaneNode)
		}

		function removeSplitter(node: Element) {
			node.onmousedown = undefined
			node.onclick = undefined
			node.ondblclick = undefined
			node.remove()
		}

		// Called by Pane component on programmatic resize.
		function requestUpdate({target, ...args}: any) {
			const pane = data.indexedPanes[target._uid]
			Object.entries(args).forEach(([key, value]) => (pane[key] = value))
		}

		function onPaneAdd(
			el: HTMLElement,
			pane: {size: number; minSize: number; maxSize: number; uid: string}
		) {
			if (!container.value) return

			console.log('onPaneAdd', pane)
			// 1. Add pane to array at the same index it was inserted in the <splitpanes> tag.
			let index = -1

			Array.from(container.value.children).some(child => {
				if (child.className.includes('splitpanes__pane')) index++
				return el === child
			})

			const min = pane.minSize
			const max = pane.maxSize
			data.panes.splice(index, 0, {
				id: pane.uid,
				index,
				min: isNaN(min) ? 0 : min,
				max: isNaN(max) ? 100 : max,
				size: pane.size === null ? null : pane.size,
				givenSize: pane.size,
			})
			// Redo indexes after insertion for other shifted panes.
			data.panes.forEach((p, i) => (p.index = i))
			if (data.ready) {
				// 2. Add the splitter.
				redoSplitters()
				// 3. Resize the panes.
				resetPaneSizes({addedPane: data.panes[index]})
				// 4. Fire `pane-add` event.
				context.emit('pane-add', {
					index,
					panes: data.panes.map(pane => ({
						min: pane.min,
						max: pane.max,
						size: pane.size,
					})),
				})
			}
		}
		function onPaneRemove(pane) {
			// 1. Remove the pane from array and redo indexes.
			const index = data.panes.findIndex(p => p.id === pane._uid)
			const removed = data.panes.splice(index, 1)[0]
			data.panes.forEach((p, i) => (p.index = i))
			// 2. Remove the splitter.
			redoSplitters()
			// 3. Resize the panes.
			resetPaneSizes({removedPane: {...removed, index}})
			// 4. Fire `pane-remove` event.
			context.emit('pane-remove', {
				removed,
				panes: data.panes.map(pane => ({
					min: pane.min,
					max: pane.max,
					size: pane.size,
				})),
			})
		}

		function resetPaneSizes(changedPanes = {}) {
			if (!changedPanes.addedPane && !changedPanes.removedPane)
				initialPanesSizing()
			else if (
				data.panes.some(
					pane => pane.givenSize !== null || pane.min || pane.max < 100
				)
			)
				equalizeAfterAddOrRemove(changedPanes)
			else equalize()
			if (data.ready)
				context.emit(
					'resized',
					data.panes.map(pane => ({
						min: pane.min,
						max: pane.max,
						size: pane.size,
					}))
				)
		}
		function equalize() {
			const equalSpace = 100 / data.panesCount
			let leftToAllocate = 0
			let ungrowable = []
			let unshrinkable = []
			data.panes.forEach(pane => {
				pane.size = Math.max(Math.min(equalSpace, pane.max), pane.min)
				leftToAllocate -= pane.size
				if (pane.size >= pane.max) ungrowable.push(pane.id)
				if (pane.size <= pane.min) unshrinkable.push(pane.id)
			})
			if (leftToAllocate > 0.1)
				readjustSizes(leftToAllocate, ungrowable, unshrinkable)
		}
		function initialPanesSizing() {
			let leftToAllocate = 100
			let ungrowable = []
			let unshrinkable = []
			let definedSizes = 0
			// Check if pre-allocated space is 100%.
			data.panes.forEach(pane => {
				leftToAllocate -= pane.size
				if (pane.size !== null) definedSizes++
				if (pane.size >= pane.max) ungrowable.push(pane.id)
				if (pane.size <= pane.min) unshrinkable.push(pane.id)
			})
			// set pane sizes if not set.
			let leftToAllocate2 = 100
			if (leftToAllocate > 0.1) {
				data.panes.forEach(pane => {
					if (pane.size === null) {
						pane.size = Math.max(
							Math.min(
								leftToAllocate / (panesCount.value - definedSizes),
								pane.max
							),
							pane.min
						)
					}
					leftToAllocate2 -= pane.size
				})
				if (leftToAllocate2 > 0.1) {
					// debugger
					readjustSizes(leftToAllocate, ungrowable, unshrinkable)
				}
			}
		}

		function equalizeAfterAddOrRemove({addedPane} = {}) {
			let equalSpace = 100 / data.panesCount
			let leftToAllocate = 0
			let ungrowable = []
			let unshrinkable = []
			if (addedPane && addedPane.givenSize !== null) {
				equalSpace = (100 - addedPane.givenSize) / (panesCount.value - 1)
			}
			// Check if pre-allocated space is 100%.
			data.panes.forEach(pane => {
				leftToAllocate -= pane.size
				if (pane.size >= pane.max) ungrowable.push(pane.id)
				if (pane.size <= pane.min) unshrinkable.push(pane.id)
			})
			if (Math.abs(leftToAllocate) < 0.1) return // Ok.
			data.panes.forEach(pane => {
				if (
					addedPane &&
					addedPane.givenSize !== null &&
					addedPane.id === pane.id
				) {
					null
				} else pane.size = Math.max(Math.min(equalSpace, pane.max), pane.min)
				leftToAllocate -= pane.size
				if (pane.size >= pane.max) ungrowable.push(pane.id)
				if (pane.size <= pane.min) unshrinkable.push(pane.id)
			})
			if (leftToAllocate > 0.1)
				readjustSizes(leftToAllocate, ungrowable, unshrinkable)
		}

		// Second loop to adjust sizes now that we know more about the panes constraints.
		function readjustSizes(leftToAllocate, ungrowable, unshrinkable) {
			let equalSpaceToAllocate
			if (leftToAllocate > 0)
				equalSpaceToAllocate =
					leftToAllocate / (data.panes.length - ungrowable.length)
			else
				equalSpaceToAllocate =
					leftToAllocate / (data.panes.length - unshrinkable.length)
			// debugger
			data.panes.forEach(pane => {
				if (leftToAllocate > 0 && !ungrowable.includes(pane.id)) {
					// Need to diff the size before and after to get the exact allocated space.
					const newPaneSize = Math.max(
						Math.min(pane.size + equalSpaceToAllocate, pane.max),
						pane.min
					)
					const allocated = newPaneSize - pane.size
					leftToAllocate -= allocated
					pane.size = newPaneSize
				} else if (!unshrinkable.includes(pane.id)) {
					// Need to diff the size before and after to get the exact allocated space.
					const newPaneSize = Math.max(
						Math.min(pane.size + equalSpaceToAllocate, pane.max),
						pane.min
					)
					const allocated = newPaneSize - pane.size
					leftToAllocate -= allocated
					pane.size = newPaneSize
				}
			})
			if (Math.abs(leftToAllocate) > 0.1) {
				// > 0.1: Prevent maths rounding issues due to bytes.
				// Don't emit on hot reload when Vue destroys panes.
				nextTick(() => {
					if (data.ready) {
						console.warn(
							'Splitpanes: Could not resize panes correctly due to their constraints.'
						)
					}
				})
			}
		}

		// Provide

		provide('splitpanes', {
			requestUpdate,
			onPaneAdd,
			onPaneRemove,
		})

		// Watchers

		// Every time a pane is updated, update the panes accordingly.
		watch(
			() => data.panes,
			() => updatePaneComponents(),
			{deep: true, immediate: true}
		)

		watch(
			() => props.horizontal,
			() => updatePaneComponents()
		)

		watch(
			() => props.firstSplitter,
			() => redoSplitters()
		)

		watch(
			() => props.dblClickSplitter,
			enable => {
				if (!container.value) return

				const splitters = [
					...container.value.querySelectorAll('.splitpanes__splitter'),
				] as HTMLElement[]

				splitters.forEach((splitter, i) => {
					if (enable)
						splitter.ondblclick = event => onSplitterDblClick(event, i)
				})
			}
		)

		// Hooks
		onMounted(() => {
			checkSplitpanesNodes()
			redoSplitters()
			resetPaneSizes()
			context.emit('ready')
			data.ready = true
		})

		onUnmounted(() => {
			// Prevent emitting console warnings on hot reloading.
			data.ready = false
		})

		return {
			container,
			...toRefs(data),
			panesCount,
			indexedPanes,
		}
	},
})
</script>

<style lang="stylus">
.splitpanes
	display flex
	width 100%
	height 100%

	&--vertical
		flex-direction row

	&--horizontal
		flex-direction column

	&--dragging *
		user-select none

	&__pane
		overflow hidden
		width 100%
		height 100%

		.splitpanes--vertical &
			transition width 0.2s ease-out

		.splitpanes--horizontal &
			transition height 0.2s ease-out

		.splitpanes--dragging &
			transition none

	// Disable default zoom behavior on touch device when double tapping splitter.
	&__splitter
		touch-action none

	&--vertical > .splitpanes__splitter
		min-width 1px
		cursor col-resize

	&--horizontal > .splitpanes__splitter
		min-height 1px
		cursor row-resize

.splitpanes.default-theme
	.splitpanes__pane
		background-color #f2f2f2

	.splitpanes__splitter
		position relative
		flex-shrink 0
		box-sizing border-box
		background-color #fff

		&:before, &:after
			position absolute
			top 50%
			left 50%
			background-color rgba(0, 0, 0, 0.15)
			content ''
			transition background-color 0.3s

		&:hover:before, &:hover:after
			background-color rgba(0, 0, 0, 0.25)

		&:first-child
			cursor auto

.default-theme
	&.splitpanes .splitpanes .splitpanes__splitter
		z-index 1

	&.splitpanes--vertical > .splitpanes__splitter, .splitpanes--vertical > .splitpanes__splitter
		margin-left -1px
		width 7px
		border-left 1px solid #eee

		&:before, &:after
			width 1px
			height 30px
			transform translateY(-50%)

		&:before
			margin-left -2px

		&:after
			margin-left 1px

	&.splitpanes--horizontal > .splitpanes__splitter, .splitpanes--horizontal > .splitpanes__splitter
		margin-top -1px
		height 7px
		border-top 1px solid #eee

		&:before, &:after
			width 30px
			height 1px
			transform translateX(-50%)

		&:before
			margin-top -2px

		&:after
			margin-top 1px
</style>
