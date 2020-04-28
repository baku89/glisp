<template>
	<div class="ViewHandles">
		<div class="ViewHandles__transform" :style="transformStyle">
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
	markMalVector,
	M_EVAL,
	M_OUTER,
	isVector,
	isKeyword,
	isMap,
	createMalVector
} from '../mal/types'
import {mat2d, vec2} from 'gl-matrix'

@Component({})
export default class ViewHandles extends Vue {
	@Prop({required: true}) exp!: MalVal

	private get params(): MalVal[] | null {
		return this.handleInfo && Array.isArray(this.exp)
			? this.exp
					.slice(1)
					.map((e: any) => (e[M_EVAL] !== undefined ? e[M_EVAL] : e))
			: null
	}

	private beforeUnmount() {
		this.unregisterMouseEvents()
	}

	private unregisterMouseEvents() {
		window.removeEventListener('mousemove', this.onMousemove)
		window.removeEventListener('mouseup', this.onMouseup)
	}

	private calcTransform(exp: any, xform: mat2d = mat2d.create()): mat2d {
		if (
			isVector(exp) &&
			isKeyword(exp[0]) &&
			isMap(exp[1]) &&
			Array.isArray(exp[1][K('transform')])
		) {
			let elXform = exp[1][K('transform')] as any
			elXform = elXform[M_EVAL] || elXform

			mat2d.multiply(xform, xform, elXform)
		}

		if (exp[M_OUTER]) {
			return this.calcTransform(exp[M_OUTER], xform)
		} else {
			return xform
		}
	}

	private get transform(): mat2d {
		if (this.exp !== null && this.exp instanceof Object) {
			return this.calcTransform(this.exp)
		} else {
			return [1, 0, 0, 1, 0, 0]
		}
	}

	private get transformInv() {
		return mat2d.invert(mat2d.create(), this.transform)
	}

	private get transformStyle() {
		return {
			transform: `matrix(${this.transform.join(',')})`
		}
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
		if (this.handleInfo && this.params) {
			const drawHandle = this.handleInfo[K('draw-handle')]

			const handles = drawHandle(...this.params)

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

		window.addEventListener('mousemove', this.onMousemove)
		window.addEventListener('mouseup', this.onMouseup)
	}

	private onMousemove(e: MouseEvent) {
		if (!this.handleInfo || !this.handles || !this.params) {
			return
		}

		const onDrag = this.handleInfo[K('on-drag')]

		const pos = markMalVector([e.clientX, e.clientY]) as number[]
		vec2.transformMat2d(pos as vec2, pos as vec2, this.transformInv)

		const newParams = onDrag(this.draggingId, pos, this.params)
		const newExp = [(this.exp as any[])[0], ...newParams]

		this.$emit('input', newExp)
	}

	private onMouseup() {
		this.draggingId = null
		this.unregisterMouseEvents()
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
