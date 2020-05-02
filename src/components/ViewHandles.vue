<template>
	<div class="ViewHandles">
		<div class="ViewHandles__transform" :style="transformStyle">
			<template v-for="({type, id, style}, i) in handles">
				<div
					:key="i"
					:class="type"
					:style="style"
					@mousedown="onMousedown(id, $event)"
				/>
			</template>
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
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
	isMap
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'

const K_ALIAS = K('alias'),
	K_ANGLE = K('angle'),
	K_HANDLES = K('handles'),
	K_ID = K('id'),
	K_META = K('meta'),
	K_POS = K('pos'),
	K_TYPE = K('type'),
	K_TRANSFORM = K('transform'),
	K_DRAW = K('draw'),
	K_ON_DRAG = K('on-drag'),
	K_CHANGE_ID = K('change-id')

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
			exp[1][K_TRANSFORM] !== undefined
		) {
			let elXform = exp[1][K_TRANSFORM] as any
			elXform = elXform[M_EVAL] || elXform

			mat2d.multiply(xform, elXform, xform)
		}

		if (exp && exp[M_OUTER]) {
			return this.calcTransform(exp[M_OUTER], xform)
		} else {
			return xform
		}
	}

	private getWrappedElement(exp: any) {
		let outer

		while (exp && (outer = exp[M_OUTER])) {
			if (isVector(outer) && isKeyword(outer[0])) {
				// Item
				if (isMap(exp) && outer[1] === exp) {
					// When the exp is an attribute
					return (outer as any)[M_OUTER] || null
				} else {
					return outer
				}
			}
			exp = outer
		}
	}

	private get transform(): mat2d {
		if (this.exp !== null && this.exp instanceof Object) {
			const wrappedElement = this.getWrappedElement(this.exp)
			return this.calcTransform(wrappedElement)
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

		if (exp !== null && exp[M_FN] && exp[M_FN][M_META]) {
			const meta = exp[M_FN][M_META]

			if (meta[K_ALIAS] && meta[K_ALIAS][K_META]) {
				return meta[K_ALIAS][K_META][K_HANDLES] || null
			} else {
				return meta[K_HANDLES] || null
			}
		}

		return null
	}

	private get handles(): {type: string; id: any; style: any}[] | null {
		if (this.handleInfo && this.params) {
			const drawHandle = this.handleInfo[K_DRAW]

			const handles = drawHandle(...this.params)

			return handles.map((h: any) => {
				const type = h[K_TYPE]
				const pos = h[K_POS]

				const style: any = {left: pos[0] + 'px', top: pos[1] + 'px'}

				if (type === 'biarrow') {
					style['transform'] = `rotate(${h[K_ANGLE]}rad)`
				}

				return {
					id: h[K_ID],
					type,
					style
				}
			})
		} else {
			return null
		}
	}

	private draggingId: MalVal | null = null

	private onMousedown(id: any) {
		this.draggingId = id
		window.addEventListener('mousemove', this.onMousemove)
		window.addEventListener('mouseup', this.onMouseup)
	}

	private onMousemove(e: MouseEvent) {
		if (!this.handleInfo || !this.handles || !this.params) {
			return
		}

		const onDrag = this.handleInfo[K_ON_DRAG]

		const viewRect = this.$el.getBoundingClientRect()

		const pos = markMalVector([
			e.clientX - viewRect.left,
			e.clientY - viewRect.top
		]) as number[]

		vec2.transformMat2d(pos as vec2, pos as vec2, this.transformInv)

		let newParams = onDrag(this.draggingId, pos, this.params) as MalVal[]

		if (newParams[0] === K_CHANGE_ID) {
			this.draggingId = newParams[1]
			newParams = newParams[2] as MalVal[]
		}

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
	overflow hidden
	height 100%

	&__transform
		.point
			$size = 1rem
			position absolute
			margin-top $size * -0.5
			margin-left $size * -0.5
			width $size
			height $size
			border 1px solid var(--blue)
			border-radius 50%
			background var(--background)

			&:before
				position absolute
				top -0.5rem
				right -0.5rem
				bottom -0.5rem
				left -0.5rem
				display block
				// background blue
				border-radius 50%
				content ''

			&:hover
				border-width 2px
				background var(--blue)

		.biarrow
			$size = 1rem
			position absolute
			margin-top $size * -0.5
			margin-left $size * -0.5
			width $size
			height $size
			transform-origin 50% 50%

			&:before, &:after
				position absolute
				top 0
				left 0

			&:hover:before
				background var(--blue)

			&:before
				z-index 10
				display block
				width $size
				height $size
				border 1px solid var(--blue)
				border-radius 50%
				background var(--background)
				content ''

			&:after
				margin-top -0.5rem
				margin-left -2rem
				width 5rem
				height 2rem
				color var(--blue)
				content '<- ->'
				text-align center
				white-space nowrap
				line-height 2rem
</style>
