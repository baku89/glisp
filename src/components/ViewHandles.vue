<template>
	<div class="ViewHandles" @mousemove="onMousemove" @mouseup="onMouseup">
		<div class="ViewHandles__transform">
			<template v-for="{type, id, style} in handles">
				<div
					:key="id"
					:class="type"
					:style="style"
					@mousedown="onMousedown(id, $event)"
				/>
			</template>
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import {
	MalVal,
	M_META,
	M_FN,
	keywordFor as K,
	markMalVector
} from '../mal/types'

@Component({})
export default class ViewHandles extends Vue {
	@Prop({required: true}) exp!: MalVal

	private get params() {
		return this.handleInfo && Array.isArray(this.exp) ? this.exp.slice(1) : null
	}

	private get handleInfo() {
		const exp = this.exp as any

		if (
			exp !== null &&
			exp[M_FN] &&
			exp[M_FN][M_META] &&
			exp[M_FN][M_META][K('handles')]
		) {
			return exp[M_FN][M_META][K('handles')]
		}

		return null
	}

	private get handles(): {type: string; id: any; style: any}[] | null {
		if (this.handleInfo && Array.isArray(this.exp)) {
			const drawHandle = this.handleInfo[K('draw-handle')]
			const handles = drawHandle(...this.exp.slice(1))

			return handles.map((h: any) => {
				const pos = h[K('pos')]

				return {
					type: h[K('type')],
					id: h[K('id')],
					style: {left: pos[0] + 'px', top: pos[1] + 'px'}
				}
			})
		} else {
			return null
		}
	}

	private draggingId: MalVal | null = null

	private onMousedown(id: any, e: MouseEvent) {
		this.draggingId = id
	}

	private onMousemove(e: MouseEvent) {
		if (this.draggingId == null) {
			return
		}

		if (!this.handleInfo || !this.handles || !this.params) {
			return
		}

		const {clientX, clientY} = e

		const onDrag = this.handleInfo[K('on-drag')]
		const pos = markMalVector([clientX, clientY])
		const newParams = onDrag(this.draggingId, pos, this.params)
		const newExp = [(this.exp as any[])[0], ...newParams]

		this.$emit('input', newExp)
	}

	private onMouseup() {
		this.draggingId = null
	}
}
</script>

<style lang="stylus" scoped>
.ViewHandles
	position relative
	height 100%
	overflow hidden

	&__transform

		.point
			$size = 1rem
			position absolute
			width $size
			height $size
			margin-top $size * -0.5
			margin-left $size * -0.5
			border-radius 50%
			border 1px solid var(--blue)
			background var(--background)

			&:before
				content ''
				position absolute
				top -.5rem
				right -.5rem
				bottom -.5rem
				left -.5rem
				display block
				// background blue
				border-radius 50%

			&:hover
				background var(--blue)
				border-width 2px
</style>
