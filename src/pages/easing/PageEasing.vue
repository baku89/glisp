<template>
	<div class="PageEasing">
		<div class="PageEasing__content">
			<h1>Easing Editor</h1>
			<div class="PageEasing__viewport">
				<div class="PageEasing__viewport-frame">
					<div class="PageEasing__sphere" :style="{left: currentLeft}" />
				</div>
			</div>
			<div class="PageEasing__control">
				<button class="PageEasing__play" @click="togglePlay">
					<i class="fas fa-pause" v-if="isPlaying" />
					<i class="fas fa-play" v-else />
				</button>
			</div>
			<div class="PageEasing__editor">
				<div class="PageEasing__editor-frame" ref="elEditor">
					<div
						class="PageEasing__seekbar"
						:style="{left: `${(currentFrame / (duration - 1)) * 100}%`}"
					/>
					<svg class="PageEasing__graph" overflow="visible">
						<g class="position" :class="{active: editingMode === 'position'}">
							<polyline class="value" :points="position.points" />
							<polyline class="guide" :points="position.guides[0]" />
							<polyline class="guide" :points="position.guides[1]" />
						</g>

						<g class="velocity" :class="{active: editingMode === 'velocity'}">
							<polyline class="value" :points="velocity.points" />
							<polyline class="guide" :points="velocity.guides[0]" />
						</g>

						<g class="accel" :class="{active: editingMode === 'accel'}">
							<polyline class="value" :points="accel.points" />
							<polyline class="guide" :points="accel.guides[0]" />
						</g>
					</svg>
				</div>
			</div>
			<div class="PageEasing__actions">
				<button
					class="position"
					:class="{active: editingMode === 'position'}"
					@click="editingMode = 'position'"
				>
					Pos
				</button>
				<button
					class="velocity"
					:class="{active: editingMode === 'velocity'}"
					@click="editingMode = 'velocity'"
				>
					Vel
				</button>
				<button
					class="accel"
					:class="{active: editingMode === 'accel'}"
					@click="editingMode = 'accel'"
				>
					Accel
				</button>
				<button class="PageEasing__smooth" @click="convolve([1, 2, 1])">
					Smoothify
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {useElementSize} from '@vueuse/core'
import {clamp} from 'lodash'
import {
	computed,
	defineComponent,
	onMounted,
	onUnmounted,
	reactive,
	ref,
	toRefs,
} from 'vue'

import useDraggable from '@/components/use/use-draggable'
import useScheme from '@/components/use/use-scheme'

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

function computeDerivative(values: number[]) {
	return values.map((v, i) => (i == 0 ? v : v - values[i - 1]))
}

function computeIntegral(start: number, values: number[]) {
	let current = 0
	return values.map(v => {
		current += v
		return current
	})
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
		const fps = 60
		const duration = 120

		let timer: any = null

		const data = reactive({
			// UI status
			isPlaying: false,
			editingMode: 'position',
			currentFrame: 0,
			currentPosition: computed(() => position.values[data.currentFrame]),
			// styles
			currentLeft: computed(() => `${data.currentPosition * 100}%`),
		}) as {
			isPlaying: boolean
			editingMode: 'position' | 'velocity' | 'accel'
			currentFrame: number
			currentPosition: number

			currentLeft: string
		}

		// Graph
		const elEditor = ref<null | HTMLElement>(null)
		const {height: editorHeight, width: editorWidth} = useElementSize(elEditor)

		function getGuidePath(yvalue: number, ymin: number, ymax: number) {
			const y = fit(yvalue, ymin, ymax, editorHeight.value, 0)
			return [0, y, editorWidth.value, y].join(' ')
		}

		function computePoints(valmin: number, valmax: number, values: number[]) {
			const ymin = editorHeight.value
			const ymax = 0

			const xstep = editorWidth.value / (duration - 1)

			return values
				.flatMap((v, i) => [i * xstep, fit(v, valmin, valmax, ymin, ymax)])
				.join(' ')
		}

		const initialPos = new Array(duration).fill(0).map((_, i) => {
			const phase = (i / (duration - 1)) * Math.PI
			return fit(Math.cos(phase), 1, -1, 0, 1)
		})

		const position = reactive({
			values: initialPos,
			min: -0.1,
			max: 1.1,
			points: computed(() =>
				computePoints(position.min, position.max, position.values)
			),
			guides: computed(() => {
				const min = position.min
				const max = position.max
				return [getGuidePath(0, min, max), getGuidePath(1, min, max)]
			}),
		}) as ValueData

		const initialVel = computeDerivative(initialPos)

		const velocity = reactive({
			values: initialVel,
			min: -1,
			max: 1,
			points: computed(() =>
				computePoints(velocity.min, velocity.max, velocity.values)
			),
			guides: computed(() => [getGuidePath(0, velocity.min, velocity.max)]),
		}) as ValueData

		const initialAccel = computeDerivative(initialVel)

		const accel = reactive({
			values: [],
			min: -1,
			max: 1,
			points: computed(() => computePoints(accel.min, accel.max, accel.values)),
			guides: computed(() => [getGuidePath(0, accel.min, accel.max)]),
		}) as ValueData

		updateValues()

		const targetValueData = computed(() => {
			if (data.editingMode === 'position') {
				return position
			} else if (data.editingMode === 'velocity') {
				return velocity
			} else {
				return accel
			}
		})

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

		function onKeydown(e: KeyboardEvent) {
			switch (e.key) {
				case ' ':
					togglePlay()
					break
				case 'p':
					data.editingMode = 'position'
					break
				case 'v':
					data.editingMode = 'velocity'
					break
				case 'a':
					data.editingMode = 'accel'
					break
			}
		}
		onMounted(() => window.addEventListener('keydown', onKeydown))
		onUnmounted(() => window.removeEventListener('keydown', onKeydown))

		function onFrame() {
			data.currentFrame += 1
			if (data.currentFrame >= duration) {
				data.currentFrame = 0
			}
		}

		// Drag
		useDraggable(elEditor, {
			onDrag({prevPos, left, right, pos, top, bottom}) {
				const {values, min, max} = targetValueData.value

				const prevFrame = clamp(
					Math.round(fit(prevPos[0], left, right, 0, duration - 1)),
					0,
					duration - 1
				)
				const prevValue = fit(prevPos[1], bottom, top, min, max)

				const currentFrame = clamp(
					Math.round(fit(pos[0], left, right, 0, duration - 1)),
					0,
					duration - 1
				)
				const currentValue = fit(pos[1], bottom, top, min, max)

				if (prevFrame === currentFrame) {
					values[currentFrame] = currentValue
				} else {
					const step = Math.sign(currentFrame - prevFrame)
					const frames = Math.abs(currentFrame - prevFrame)

					for (let i = 1; i <= frames; i++) {
						const f = prevFrame + step * i
						values[f] = fit(i, 0, frames, prevValue, currentValue)
					}
				}
			},
			onDragEnd: updateValues,
		})

		function updateValues() {
			if (data.editingMode === 'position') {
				velocity.values = computeDerivative(position.values)
				accel.values = computeDerivative(velocity.values)
			} else if (data.editingMode === 'velocity') {
				// normalize
				const multiplier = 1 / velocity.values.reduce((a, b) => a + b, 0)
				velocity.values = velocity.values.map(v => v * multiplier)

				position.values = computeIntegral(0, velocity.values)
				accel.values = computeDerivative(velocity.values)
			} else {
				// Accel

				// normalize
				const velocityTemp = computeIntegral(velocity.values[0], accel.values)
				const multiplier = 1 / velocityTemp.reduce((a, b) => a + b, 0)
				accel.values = accel.values.map(v => v * multiplier)

				velocity.values = computeIntegral(velocity.values[0], accel.values)
				position.values = computeIntegral(position.values[0], velocity.values)
			}

			position.min = Math.min(-0.1, Math.min.call(null, ...position.values))
			position.max = Math.max(1.1, Math.max.call(null, ...position.values))

			velocity.min = Math.min(-0.02, Math.min.call(null, ...velocity.values))
			velocity.max = Math.max(0.02, Math.max.call(null, ...velocity.values))

			accel.min = Math.min(-0.0005, Math.min.call(null, ...accel.values))
			accel.max = Math.max(0.0005, Math.max.call(null, ...accel.values))
		}

		function convolve(filter: number[]) {
			if (filter.length % 2 !== 1) {
				console.warn('Invalid filter=', filter)
				return
			}

			const {values, min, max} = targetValueData.value

			const startOffset = Math.floor(filter.length / 2)

			const multiplier = 1 / filter.reduce((a, b) => a + b, 0)
			const multipliedFilter = filter.map(v => v * multiplier)

			targetValueData.value.values = values.map((v, i) => {
				let newValue = 0
				for (let j = 0; j < filter.length; j++) {
					const jt = clamp(i + j - startOffset, 0, values.length - 1)
					newValue += values[jt] * multipliedFilter[j]
				}
				return newValue
			})
			updateValues()
		}

		return {
			...toRefs(data),
			duration,
			elEditor,

			position,
			velocity,
			accel,

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
	--error #e4413a

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
		margin 0 3rem
		height 100%

		// border-width 0 2px
		// border-style solid
		// border-color var(--button)
		&:before, &:after
			position absolute
			top 50%
			display block
			margin -2rem 0 0 -2rem
			width 4rem
			height 4rem
			border 2px dashed var(--button)
			border-radius 50%
			content ''

		&:after
			left 100%

	&__sphere
		position absolute
		top 2rem
		z-index 100
		margin-left -2rem
		width 4rem
		height 4rem
		border-radius 50%
		background black

	&__control
		position relative

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
	.position
		--color var(--keyword)

	.velocity
		--color var(--function)

	.accel
		--color var(--constant)

	&__editor
		position relative
		margin-bottom 1rem
		height 20rem

	&__editor-frame
		position relative
		margin 0 2rem
		height 100%
		border-width 0 2px
		border-style solid
		border-color var(--button)

	&__seekbar
		position absolute
		margin-left -1px
		width 2px
		height 100%
		background var(--error)
		cursor ew-resize

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

		.value, .guide
			stroke var(--color)
			fill none

		.value
			opacity 0.3
			stroke-width 2px

		.active .value
			opacity 1
			stroke-width 3px

		.guide
			opacity 0.3
			stroke-width 1px
			stroke-dasharray 2 6

		.active .guide
			opacity 1
			stroke-width 2px
			stroke-dasharray 6 2

	&__actions
		position relative
		text-align center

		button
			margin 0 0.25em
			padding 0.4em 0.5em
			border 2px solid var(--color)
			border-radius 5px
			color var(--color)
			font-size 1.2rem

			&.active
				background var(--color)
				color white

	button&__smooth
		position absolute
		top 50%
		right 2rem
		padding 0.4em 0.5em
		border 2px solid var(--button)
		border-radius 5px
		color var(--button)
		font-size 1rem
		transform translate(4px, -50%)
</style>
