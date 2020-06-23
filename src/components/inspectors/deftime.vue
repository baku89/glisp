<template>
	<div class="deftime">
		<div class="deftime__control">
			<button class="deftime__toggle-play" @click="togglePlay">
				<i class="fas fa-pause" v-if="isPlaying" />
				<i class="fas fa-play" v-else />
			</button>
			<div class="deftime__seekbar" ref="seekbarRef">
				<button
					class="deftime__current-time"
					ref="currentTimeRef"
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

<script lang="ts">
import {
	defineComponent,
	SetupContext,
	ref,
	Ref,
	computed,
	onBeforeMount
} from '@vue/composition-api'
import {MalVal, isList, cloneExp, assocBang, keywordFor as K} from '@/mal/types'
import {NonReactive, nonReactive, clamp} from '@/utils'
import ParamControl from '@/components/ParamControl.vue'
import {useDraggable} from '../use'

const K_START = K('start'),
	K_DURATION = K('duration'),
	K_FPS = K('fps')

interface Props {
	exp: NonReactive<MalVal[]>
}

export default defineComponent({
	name: 'deftime',
	components: {
		ParamControl
	},
	props: {
		exp: {
			required: true,
			validator: x => x instanceof NonReactive && isList(x.value)
		}
	},
	setup(props: Props, context: SetupContext) {
		const currentTimeRef: Ref<HTMLElement | null> = ref(null)
		const seekbarRef: Ref<HTMLElement | null> = ref(null)

		const isPlaying = ref(false)

		const time = computed(() => {
			return props.exp.value[2] as number
		})

		const options = computed(() => {
			return assocBang(
				{[K_START]: 0, [K_DURATION]: 1, [K_FPS]: 0},
				...props.exp.value.slice(3)
			) as {[key: string]: number}
		})

		const startTime = computed(() => options.value[K_START])
		const endTime = computed(
			() => options.value[K_START] + options.value[K_DURATION]
		)
		const duration = computed(() => endTime.value - startTime.value)
		const normalizedPosition = computed(
			() => (time.value - startTime.value) / duration.value
		)

		function updateTime(newTime: number) {
			const exp = cloneExp(props.exp.value)
			;(exp[2] as number) = newTime
			context.emit('input', nonReactive(exp))
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
				const newTime = clamp(
					dragStartTime + dt,
					startTime.value,
					endTime.value
				)
				updateTime(newTime)
			}
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
			let newTime = time.value + dt

			// Loop
			if (newTime > endTime.value) {
				newTime -= duration.value
			}

			updateTime(newTime)

			// Set Next
			prevTimestamp = currentTimestamp
		}

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

		return {
			currentTimeRef,
			seekbarRef,
			normalizedPosition,
			isPlaying,
			isSeeking,
			togglePlay
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.deftime
	position relative

	&__control
		margin-bottom .5rem
		display flex

	&__toggle-play
		color var(--comment)
		border 1px solid var(--border)
		width 2rem
		height @width
		border-radius 50%
		text-align center
		padding -1rem
		margin-right 1.5rem
		line-height calc(2rem - 2.5px)

		&:hover
			border-color var(--highlight)
			color var(--highlight)

		.fa-play
			text-indent .1em

	&__seekbar
		flex-grow 1
		margin-right .5rem
		position relative

		&:before
			content ''
			position absolute
			top 50%
			left 0
			width 100%
			height 1px
			background var(--comment)

	&__current-time
		position absolute
		width 16px
		height 16px
		border-radius 50%
		border 1px solid var(--comment)
		margin -8px 0 0 -8px
		top 50%
		left 0%
		background var(--background)

		&:hover, &[dragging]
			border 2px solid var(--highlight)
</style>
