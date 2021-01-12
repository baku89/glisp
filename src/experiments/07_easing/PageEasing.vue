<template>
	<div class="PageEasing">
		<div class="PageEasing__content">
			<h1>Easing Editor</h1>
			<div class="PageEasing__viewport">
				<div class="PageEasing__viewport-frame">
					<div class="PageEasing__sphere" :style="{left: currentLeft}" />
				</div>
			</div>
			<button class="PageEasing__play" @click="togglePlay">
				<i class="fas fa-pause" v-if="isPlaying" />
				<i class="fas fa-play" v-else />
			</button>
			<div class="PageEasing__editor">
				<div class="PageEasing__editor-frame" ref="elEditor">
					<div
						class="PageEasing__seekbar"
						:style="{left: `${(currentFrame / (duration - 1)) * 100}%`}"
					/>
					<svg class="PageEasing__graph" overflow="visible">
						<polyline class="PageEasing__value" :points="positions.points" />
						<polyline class="PageEasing__guide" :points="positions.guides[0]" />
						<polyline class="PageEasing__guide" :points="positions.guides[1]" />
					</svg>
				</div>
			</div>
			<div class="PageEasing__actions">
				<button @click="convolve([1, 1, 1])">Smooth</button>
				<button class="pos" :class="{active: editingMode === 'pos'}">
					Pos
				</button>
				<button class="vel" :class="{active: editingMode === 'vel'}">
					Vel
				</button>
				<button class="accel" :class="{active: editingMode === 'accel'}">
					Accel
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {useElementSize} from '@vueuse/core'
import {computed, defineComponent, reactive, ref, toRefs} from 'vue'

import useDraggable from '@/components/use/use-draggable'
import useScheme from '@/components/use/use-scheme'
import {clamp} from '@/utils'

function fit(
	value: number,
	srcMin: number,
	srcMax: number,
	dstMin: number,
	dstMax: number
) {
	const t = (value - srcMin) / (srcMax - srcMin)
	return t * (dstMax - dstMin) + dstMin
}

function getGuidePath(
	yvalue: number,
	ymin: number,
	ymax: number,
	width: number,
	height: number
) {
	const y = fit(yvalue, ymin, ymax, height, 0)
	return [0, y, width, y].join(' ')
}

interface ValueData {
	values: number[]
	min: number
	max: number
	points: string
	guides: string[]
}

export default defineComponent({
	name: 'PageEasing',
	setup() {
		const {background} = useScheme()
		background.value = 'white'

		// constants
		const fps = 120
		const duration = 240

		let timer: any = null

		const data = reactive({
			// UI status
			isPlaying: false,
			editingMode: 'pos',
			currentFrame: 0,
			currentPosition: computed(() => positions.values[data.currentFrame]),

			// styles
			currentLeft: computed(() => `${data.currentPosition * 100}%`),
		}) as {
			isPlaying: boolean
			currentFrame: number
			currentPosition: number

			currentLeft: string
		}

		// Graph
		const elEditor = ref<null | HTMLElement>(null)

		const {height: editorHeight, width: editorWidth} = useElementSize(elEditor)

		const positions = reactive({
			values: new Array(duration).fill(0).map((_, i) => i / (duration - 1)),
			min: 0,
			max: 1,
			points: computed(() => {
				const valmin = positions.min
				const valmax = positions.max

				const ymin = editorHeight.value
				const ymax = 0

				const xstep = editorWidth.value / (duration - 1)

				return positions.values
					.map((v, i) => [i * xstep, fit(v, valmin, valmax, ymin, ymax)])
					.flat()
					.join(' ')
			}),
			guides: computed(() => {
				const min = positions.min
				const max = positions.max
				const w = editorWidth.value
				const h = editorHeight.value

				return [
					getGuidePath(0, min, max, w, h),
					getGuidePath(1, min, max, w, h),
				]
			}),
		}) as ValueData

		// Playing
		function togglePlay() {
			if (data.isPlaying) {
				// stop playing
				data.isPlaying = false
				clearInterval(timer)
			} else {
				// start playing
				data.isPlaying = true

				timer = setInterval(onFrame, 1000 / fps)
			}
		}

		function onFrame() {
			data.currentFrame += 1
			if (data.currentFrame >= duration) {
				data.currentFrame = 0
			}
		}

		// Drag
		useDraggable(elEditor, {
			onDrag({prevPos, left, right, pos, top, bottom}) {
				const valmin = positions.min
				const valmax = positions.max

				const prevFrame = clamp(
					Math.round(fit(prevPos[0], left, right, 0, duration - 1)),
					0,
					duration - 1
				)

				const prevValue = fit(prevPos[1], bottom, top, valmin, valmax)

				const frame = clamp(
					Math.round(fit(pos[0], left, right, 0, duration - 1)),
					0,
					duration - 1
				)

				const value = fit(pos[1], bottom, top, valmin, valmax)

				const step = Math.sign(frame - prevFrame)
				const frames = Math.abs(frame - prevFrame)

				for (let i = 0; i < frames; i++) {
					const f = prevFrame + step * i

					if (frames <= 1) {
						positions.values[f] = value
					} else {
						positions.values[f] = fit(i, 0, frames, prevValue, value)
					}
				}
			},
			onDragEnd: updateValueRange,
		})

		function updateValueRange() {
			positions.min = Math.min.call(null, ...positions.values)
			positions.max = Math.max.call(null, ...positions.values)
		}

		function convolve(filter: number[]) {
			if (filter.length % 2 !== 1) {
				console.warn('Invalid filter=', filter)
				return
			}

			const startOffset = Math.floor(filter.length / 2)

			const multiplier = 1 / filter.reduce((a, b) => a + b, 0)
			const multipliedFilter = filter.map(v => v * multiplier)

			positions.values = positions.values.map((v, i) => {
				let newValue = 0
				for (let j = 0; j < filter.length; j++) {
					const jt = clamp(i + j - startOffset, 0, positions.values.length - 1)
					newValue += positions.values[jt] * multipliedFilter[j]
				}
				return newValue
			})
			updateValueRange()
		}

		return {
			...toRefs(data),
			duration,
			elEditor,
			positions,
			togglePlay,
			convolve,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

html
	font-size 20px

.PageEasing
	app()
	overflow-x hidden
	padding 2rem 0
	height 100vh

	&__content
		margin 0 auto
		padding 1rem
		max-width 50rem
		// border 1px solid var(--frame)

	h1
		font-size 1.5rem

	&__viewport
		position relative
		height 8rem

	&__viewport-frame
		position relative
		margin 0 2rem
		height 100%
		border-width 0 2px
		border-style solid
		border-color var(--button)

	&__sphere
		position absolute
		top 2rem
		margin-left -2rem
		width 4rem
		height 4rem
		border-radius 50%
		background black

	&__play
		display block
		margin 2rem auto
		width 4rem
		height @width
		border-radius 50%
		background var(--button)
		color var(--background)
		font-size 1.5rem

		.fa-play
			text-indent 0.2em

	// Editors
	&__editor
		position relative
		margin-bottom 1rem
		height 20rem

	&__editor-frame
		position relative
		margin 0 2rem
		height 100%
		border-width 0 1px
		border-style solid
		border-color var(--button)

	&__seekbar
		position absolute
		margin-left -1px
		width 2px
		height 100%
		background var(--error)

		&:before
			top 0
			display block
			// background var(--error)
			width 0
			height 0
			border-width 0.5rem 0.5rem 0 0.5rem
			border-style solid
			border-color var(--error) transparent transparent transparent
			content ''
			transform translate(-50%, -60%)

	&__graph
		width 100%
		height 100%

	&__value, &__guide
		stroke var(--keyword)
		fill none

	&__value
		stroke-width 2px

	&__guide
		stroke-width 1px
		stroke-dasharray 6 2

	&__actions
		text-align center

		button
			margin 0 0.25em
			padding 0.4em 0.5em
			border 2px solid var(--color)
			border-radius 5px
			color var(--color)
			font-size 1.2rem

			&.pos
				--color var(--keyword)

			&.active
				background var(--color)
				color white
</style>
