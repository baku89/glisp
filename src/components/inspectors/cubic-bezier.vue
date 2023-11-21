<template>
	<div class="Inspector-cubic-bezier">
		<ParamControl
			:exp="exp"
			@input="$emit('input', $event)"
			@select="$emit('select', $event)"
		/>
		<svg ref="svgEl" class="Inspector-cubic-bezier__svg">
			<line class="diagonal" x1="0" :y1="size[1]" :x2="size[1]" y2="0" />
			<path
				class="curve"
				:d="`M 0,${size[1]} C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${size[0]},0`"
			/>

			<line class="handle" x1="0" :y1="size[1]" :x2="c1[0]" :y2="c1[1]" />
			<line class="handle" :x1="size[0]" y1="0" :x2="c2[0]" :y2="c2[1]" />

			<line class="t" :x1="tx" y1="0" :x2="tx" :y2="size[1]" />

			<circle
				ref="c1El"
				:cx="c1[0]"
				:cy="c1[1]"
				:r="radius"
				:dragging="isDraggingC1"
			/>
			<circle
				ref="c2El"
				:cx="c2[0]"
				:cy="c2[1]"
				:r="radius"
				:dragging="isDraggingC2"
			/>
		</svg>
	</div>
</template>

<script lang="ts" setup>
import {clamp} from 'lodash'
import {computed, Ref, ref, toRef} from 'vue'

import {useDraggable, useRem, useResizeSensor} from '@/components/use'
import {cloneExpr, Expr, getEvaluated} from '@/glisp'

interface Props {
	exp: Expr[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: Expr[]]
	select: [value: Expr]
	'end-tweak': []
}>()

const svgEl: Ref<null | HTMLElement> = ref(null)
const c1El: Ref<null | HTMLElement> = ref(null)
const c2El: Ref<null | HTMLElement> = ref(null)

const size = ref([0, 0])

useResizeSensor(
	svgEl,
	(el: HTMLElement) => {
		const {width, height} = el.getBoundingClientRect()
		size.value = [width, height]
	},
	true
)

const tx = computed(
	() => size.value[0] * (getEvaluated(props.exp[5]) as number)
)

const c1 = computed(() => {
	return [
		size.value[0] * (props.exp[1] as number),
		size.value[1] * (1 - (props.exp[2] as number)),
	]
})

const c2 = computed(() => {
	return [
		size.value[0] * (props.exp[3] as number),
		size.value[1] * (1 - (props.exp[4] as number)),
	]
})

// Saves the value on dragstart
let ox = 0,
	oy = 0

const c1Drag = useDraggable(c1El, {
	onDragStart() {
		ox = props.exp[1] as number
		oy = props.exp[2] as number
	},
	onDrag(e) {
		const dx = e.x / size.value[0]
		const dy = e.y / -size.value[1]

		const exp = cloneExpr(props.exp) as number[]

		exp[1] = clamp(ox + dx, 0, 1)
		exp[2] = oy + dy

		emit('input', exp)
	},
})

const c2Drag = useDraggable(c2El, {
	onDragStart() {
		ox = props.exp[3] as number
		oy = props.exp[4] as number
	},
	onDrag(e) {
		const dx = e.x / size.value[0]
		const dy = e.y / -size.value[1]

		const exp = cloneExpr(props.exp) as number[]

		exp[3] = clamp(ox + dx, 0, 1)
		exp[4] = oy + dy

		emit('input', exp)
	},
})

const rem = useRem()
const radius = computed(() => rem.value * 0.5)

const isDraggingC1 = toRef(c1Drag, 'isDragging')
const isDraggingC2 = toRef(c2Drag, 'isDragging')
</script>

<style lang="stylus">
@import '../style/common.styl'

.Inspector-cubic-bezier
	position relative
	display flex

	&__svg
		flex 0 0 15rem
		width 15rem
		height 15rem
		border 1px solid var(--border)
		margin-left .5rem


		circle
			fill var(--background)
			stroke var(--highlight)
			stroke-width 1

			&:hover, &[dragging]
				stroke-width 3

		path, line
			fill none
			stroke var(--highlight)
			stroke-width 1px

		.diagonal
			stroke-dasharray 3 3
			stroke var(--border)

		.curve
			stroke-width 3

		.t
			stroke var(--red)

			&:hover
				stroke-width 3
</style>
@/glis[/types
