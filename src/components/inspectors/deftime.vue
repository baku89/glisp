<template>
	<div class="Inspector-deftime">
		<div class="Inspector-deftime__control">
			<button class="Inspector-deftime__toggle-play" @click="togglePlay">
				<i v-if="isPlaying" class="fas fa-pause" />
				<i v-else class="fas fa-play" />
			</button>
			<div ref="seekbarRef" class="Inspector-deftime__seekbar">
				<button
					ref="currentTimeRef"
					class="Inspector-deftime__current-time"
					:dragging="isSeeking"
					:style="{left: `${normalizedPosition * 100}%`}"
				/>
			</div>
		</div>
		<ParamControl
			:exp="exp"
			@input="$emit('input', $event)"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts" setup>
import {clamp} from 'lodash'
import {computed, onBeforeMount, Ref, ref, watch} from 'vue'

import ParamControl from '@/components/ParamControl.vue'
import {useDraggable} from '@/components/use'
import {
	assocBang,
	cloneExpr,
	getEvaluated,
	keywordFor as K,
	Expr,
} from '@/glisp/types'

const K_START = K('start'),
	K_DURATION = K('duration'),
	K_FPS = K('fps')

interface Props {
	exp: Expr[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [exp: Expr[]]
	select: [exp: Expr[]]
}>()

const currentTimeRef: Ref<HTMLElement | null> = ref(null)
const seekbarRef: Ref<HTMLElement | null> = ref(null)

const isPlaying = ref(false)

const time = computed(() => {
	return props.exp[2] as number
})

const options = computed(() => {
	return assocBang(
		{[K_START]: 0, [K_DURATION]: 1, [K_FPS]: 0},
		...props.exp.slice(3)
	) as {[key: string]: number}
})

const startTime = computed(() => getEvaluated(options.value[K_START]) as number)
const duration = computed(
	() => getEvaluated(options.value[K_DURATION]) as number
)
const endTime = computed(() => startTime.value + duration.value)
const fps = computed(() => getEvaluated(options.value[K_FPS]) as number)

const normalizedPosition = computed(() =>
	clamp((time.value - startTime.value) / duration.value, 0, 1)
)

function updateTime(newTime: number) {
	const exp = cloneExpr(props.exp)
	;(exp[2] as number) = newTime
	emit('input', exp)
}

// Seek
let dragStartTime: number

const currentTimeDrag = useDraggable(currentTimeRef, {
	onDragStart() {
		dragStartTime = time.value
	},
	onDrag(e) {
		if (!seekbarRef.value) return

		const width = seekbarRef.value.getBoundingClientRect().width
		const dt = (e.x / width) * duration.value
		const newTime = clamp(dragStartTime + dt, startTime.value, endTime.value)

		updateTime(newTime)
	},
})

const isSeeking = computed(() => {
	return currentTimeDrag.isDragging
})

// Frame updates
let rafId: number, prevTimestamp: number

function onFrame() {
	rafId = requestAnimationFrame(onFrame)

	if (isSeeking.value) {
		return
	}

	const currentTimestamp = performance.now()
	const dt = (currentTimestamp - prevTimestamp) / 1000

	// Wait until the next tick
	if (fps.value !== 0 && dt < 1 / fps.value) {
		return
	}

	let newTime = time.value + dt

	// Loop
	if (newTime > endTime.value) {
		newTime -= duration.value
	}

	updateTime(newTime)

	// Set Next
	prevTimestamp = currentTimestamp
}

// Clamp the current time within startTime...(startTime + duration)
watch(
	() => [startTime.value, duration.value],
	([startTime, duration]) => {
		if (time.value < startTime || startTime + duration < time.value) {
			const newTime = clamp(time.value, startTime, startTime + duration)
			updateTime(newTime)
		}
	}
)

// Event hooks
function togglePlay() {
	isPlaying.value = !isPlaying.value

	if (isPlaying.value) {
		prevTimestamp = performance.now()
		rafId = requestAnimationFrame(onFrame)
	} else {
		cancelAnimationFrame(rafId)
	}
}

onBeforeMount(() => {
	cancelAnimationFrame(rafId)
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.Inspector-deftime
	position relative

	&__control
		display flex
		margin-bottom 0.5rem

	&__toggle-play
		margin-right 1.5rem
		padding -1rem
		width 2rem
		height @width
		border 1px solid var(--border)
		border-radius 50%
		color var(--comment)
		text-align center
		line-height calc(2rem - 2.5px)

		&:hover
			border-color var(--highlight)
			color var(--highlight)

		.fa-play
			text-indent 0.1em

	&__seekbar
		position relative
		flex-grow 1
		margin-right 0.5rem

		&:before
			position absolute
			top 50%
			left 0
			width 100%
			height 1px
			background var(--comment)
			content ''

	&__current-time
		position absolute
		top 50%
		left 0%
		margin -8px 0 0 -8px
		width 16px
		height 16px
		border 1px solid var(--comment)
		border-radius 50%
		background var(--background)

		&:hover, &[dragging]
			border 2px solid var(--highlight)
</style>
@/glis[/types
