<template>
	<svg class="ViewHandles">
		<g class="ViewHandles__transform" :transform="transformStyle">
			<template v-for="({type, id, transform, path, cls}, i) in handles">
				<path
					v-if="type === 'path'"
					:class="cls"
					:key="i"
					:d="path"
					@mousedown="onMousedown(id, $event)"
				/>
				<g v-else :key="i" :transform="transform" @mousedown="onMousedown(id, $event)">
					<path v-if="type === 'arrow'" d="M 20 0 H -20 M -14 -5 L -20 0 L -14 5 M 14 -5 L 20 0 L 14 5" />
					<path v-if="cls === 'translate'" d="M 12 0 H -12 M 0 12 V -12" />
					<circle class="point" :class="cls" cx="0" cy="0" :r="rem * 0.5" />
				</g>
			</template>
		</g>
	</svg>
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
	isMap,
	MalNode
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {printExp} from '@/mal'
import {getSVGPathData} from '@/mal/ns/path'

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
	K_CHANGE_ID = K('change-id'),
	K_PATH = K('path'),
	K_CLASS = K('class')

@Component({})
export default class ViewHandles extends Vue {
	@Prop({required: true}) exp!: MalVal

	private rem = 0

	private get params(): MalVal[] {
		return this.handleInfo && Array.isArray(this.exp)
			? this.exp
					.slice(1)
					.map((e: any) => (e[M_EVAL] !== undefined ? e[M_EVAL] : e))
			: []
	}

	private get evaluated(): MalVal {
		return (this.exp as any)[M_EVAL] || null
	}

	private mounted() {
		this.rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
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
					return (outer as MalNode)[M_OUTER] || null
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
		return `matrix(${this.transform.join(',')})`
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
		if (this.handleInfo) {
			const drawHandle = this.handleInfo[K_DRAW]

			let handles
			try {
				handles = drawHandle(this.params, this.evaluated)
			} catch (_) {
				return null
			}

			return handles.map((h: any) => {
				const type = h[K_TYPE]
				const cls = h[K_CLASS]

				const ret: {[k: string]: string} = {
					type,
					cls,
					id: h[K_ID],
					transform: ''
				}

				if (type === 'point' || type === 'arrow') {
					const [x, y] = h[K_POS]
					ret.transform = `translate(${x}, ${y})`
				}

				if (type === 'arrow') {
					const angle = ((h[K_ANGLE] || 0) / Math.PI) * 180
					ret.transform += ` rotate(${angle})`
				}

				if (type === 'path') {
					ret.path = getSVGPathData(h[K_PATH])
				}

				return ret
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
		if (!this.handleInfo || !this.handles) {
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
	height 100% a

	circle
		stroke var(--blue)
		stroke-width 1
		fill var(--background)

		&:hover
			stroke-width 3
			fill var(--blue)

	path
		stroke var(--blue)
		fill none

		&:hover
			stroke-width 3

	.dashed
		stroke-dasharray 3 2

		&:hover
			stroke-dasharray none
</style>
