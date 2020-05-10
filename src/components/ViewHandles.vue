<template>
	<svg class="ViewHandles">
		<defs>
			<marker
				id="arrow-x"
				viewBox="0 0 10 10"
				refX="10"
				refY="5"
				markerUnits="strokeWidth"
				markerWidth="10"
				markerHeight="10"
				orient="auto-start-reverse"
			>
				<path class="axis-x" d="M 0 0 L 10 5 L 0 10" />
			</marker>
			<marker
				id="arrow-y"
				viewBox="0 0 10 10"
				refX="10"
				refY="5"
				markerUnits="strokeWidth"
				markerWidth="10"
				markerHeight="10"
				orient="auto-start-reverse"
			>
				<path class="axis-y" d="M 0 0 L 10 5 L 0 10" />
			</marker>
		</defs>
		<g v-if="handleInfo" class="ViewHandles__axis" :transform="transformStyle">
			<path class="axis-x" marker-end="url(#arrow-x)" d="M 0 0 H 200" />
			<path class="axis-y" marker-end="url(#arrow-y)" d="M 0 0 V 200" />
		</g>
		<template
			v-for="({type, id, transform, yTransform, path, cls, guide},
			i) in handles"
		>
			<g
				v-if="type === 'path'"
				class="path"
				:class="cls"
				:key="i"
				:transform="transform"
				@mousedown="!guide && onMousedown(id, $event)"
			>
				<path class="path__hover-zone" :d="path" />
				<path class="path__display" :d="path" />
			</g>
			<g
				v-else
				class="marker"
				:key="i"
				:class="cls"
				:transform="transform"
				@mousedown="!guide && onMousedown(id, $event)"
			>
				<path
					v-if="type === 'arrow'"
					d="M 20 0 H -20 M -14 -5 L -20 0 L -14 5 M 14 -5 L 20 0 L 14 5"
				/>
				<path v-if="cls === 'translate'" d="M 12 0 H -12" />
				<path
					v-if="cls === 'translate'"
					:transform="yTransform"
					d="M 0 12 V -12"
				/>
				<circle class="point" :class="cls" cx="0" cy="0" :r="rem * 0.5" />
			</g>
		</template>
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
	MalNode,
	MalNodeList,
	M_EVAL_PARAMS,
	isMalNode,
	MalMap,
	isList,
	symbolFor,
	M_OUTER_INDEX
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {getSVGPathData} from '@/mal-lib/path'

const K_ALIAS = K('alias'),
	K_ANGLE = K('angle'),
	K_HANDLES = K('handles'),
	K_ID = K('id'),
	K_META = K('meta'),
	K_GUIDE = K('guide'),
	K_POS = K('pos'),
	K_PREV_POS = K('prev-pos'),
	K_DELTA_POS = K('delta-pos'),
	K_TYPE = K('type'),
	K_TRANSFORM = K('transform'),
	K_DRAW = K('draw'),
	K_ON_DRAG = K('on-drag'),
	K_CHANGE_ID = K('change-id'),
	K_PATH = K('path'),
	K_CLASS = K('class')

@Component({})
export default class ViewHandles extends Vue {
	@Prop({required: true}) exp!: MalNode

	private rem = 0

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

	private get params(): MalVal[] {
		if (this.handleInfo && Array.isArray(this.exp)) {
			return this.exp.slice(1)
		} else {
			return []
		}
	}

	private get evaluatedParams(): MalVal[] {
		if (
			this.handleInfo &&
			Array.isArray(this.exp) &&
			(this.exp as MalNodeList)[M_EVAL_PARAMS]
		) {
			return (this.exp as MalNodeList)[M_EVAL_PARAMS]
		} else {
			return []
		}
	}

	private get evaluated(): MalVal {
		return this.exp[M_EVAL] || null
	}

	private get transformInv() {
		return mat2d.invert(mat2d.create(), this.transform)
	}

	private get transform() {
		const exp = this.exp

		if (!isMalNode(this.exp)) {
			return mat2d.create()
		}

		// Collect ancestors
		let ancestors: MalNode[] = []
		for (let outer = exp[M_OUTER]; outer; outer = outer[M_OUTER]) {
			ancestors.unshift(outer)
		}

		const attrMatrices: mat2d[] = []

		// If the exp is transform attrbute
		for (let i = ancestors.length - 1; 0 < i; i--) {
			const node = ancestors[i]
			const outer = ancestors[i - 1]

			if (
				isVector(outer) &&
				isKeyword(outer[0]) && // outer is element
				isMap(node) &&
				K_TRANSFORM in node
			) {
				const attrAncestors = ancestors.slice(i + 1)
				attrAncestors.push(exp)

				// Exclude attributes' part from ancestors
				ancestors = ancestors.slice(0, i - 1)

				// Calculate transform
				for (let j = attrAncestors.length - 1; 0 < j; j--) {
					const node = attrAncestors[j]
					const outer = attrAncestors[j - 1]

					if (isList(outer)) {
						if (outer[0] === symbolFor('transform')) {
							// Prepend matrices
							const matrices = outer
								.slice(1, node[M_OUTER_INDEX])
								.map(xform =>
									isMalNode(xform) && M_EVAL in xform ? xform[M_EVAL] : xform
								) as mat2d[]

							attrMatrices.unshift(...matrices)
						} else if (outer[0] === symbolFor('pivot')) {
							// Prepend matrices
							const matrices = outer
								.slice(2, node[M_OUTER_INDEX])
								.map(xform =>
									isMalNode(xform) && M_EVAL in xform ? xform[M_EVAL] : xform
								) as mat2d[]
							attrMatrices.unshift(...matrices)

							// Append pivot itself as translation matrix
							const pivot =
								isMalNode(outer[1]) && M_EVAL in outer[1]
									? (outer[1][M_EVAL] as vec2)
									: vec2.create()

							const pivotMat = mat2d.fromTranslation(mat2d.create(), pivot)

							attrMatrices.unshift(pivotMat)
						}
					}
				}

				break
			}
		}

		// Extract the matrices from ancestors
		const matrices = ancestors
			.filter(
				node =>
					isVector(node) &&
					isKeyword(node[0]) &&
					isMap(node[1]) &&
					K_TRANSFORM in node[1]
			)
			.map(node => ((node as MalVal[])[1] as MalMap)[K_TRANSFORM])
			.map(xform =>
				isMalNode(xform) && M_EVAL in xform ? xform[M_EVAL] : xform
			) as mat2d[]

		// Append attribute matrices
		matrices.push(...attrMatrices)

		// Multiplies all matrices in order
		const ret = matrices.reduce(
			(xform, elXform) => mat2d.multiply(xform, xform, elXform),
			mat2d.create()
		)

		return ret
	}

	private get transformStyle() {
		return `matrix(${this.transform.join(',')})`
	}

	private get handles() {
		if (this.handleInfo) {
			const drawHandle = this.handleInfo[K_DRAW]

			let handles
			try {
				handles = drawHandle(this.evaluatedParams, this.evaluated, this.params)
			} catch (err) {
				console.log(err)
				return null
			}

			if (!Array.isArray(handles)) {
				return null
			}

			return handles.map((h: any) => {
				const type = h[K_TYPE]
				const guide = !!h[K_GUIDE]
				const cls = h[K_CLASS] || ''

				const xform = mat2d.clone(this.transform)
				let yRotate = 0

				if (type === 'point' || type === 'arrow') {
					const [x, y] = h[K_POS]
					mat2d.translate(xform, xform, [x, y])
				}

				if (type === 'arrow') {
					const angle = ((h[K_ANGLE] || 0) / Math.PI) * 180
					mat2d.rotate(xform, xform, angle)
				}

				if (type !== 'path') {
					// Normalize axis X
					const axis = vec2.fromValues(xform[0], xform[1])
					vec2.normalize(axis, axis)
					xform[0] = axis[0]
					xform[1] = axis[1]

					// Force axisY to be perpendicular to axisX
					const origAxisY = vec2.fromValues(xform[2], xform[3])

					vec2.set(axis, xform[0], xform[1])
					vec2.rotate(axis, axis, [0, 0], Math.PI / 2)
					xform[2] = axis[0]
					xform[3] = axis[1]

					// set Y rotation
					if (cls === 'translate') {
						const perpAxisYAngle = Math.atan2(axis[1], axis[0])
						vec2.rotate(axis, origAxisY, [0, 0], -perpAxisYAngle)
						yRotate = Math.atan2(axis[1], axis[0])
					}
				}

				const ret: {[k: string]: string | boolean} = {
					type,
					cls: cls + (guide ? ' guide' : ''),
					guide,
					id: h[K_ID],
					transform: `matrix(${xform.join(',')})`,
					yTransform: `rotate(${(yRotate * 180) / Math.PI})`
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

	private draggingId!: MalVal
	private rawPrevPos!: number[]

	private onMousedown(id: any, e: MouseEvent) {
		this.draggingId = id
		window.addEventListener('mousemove', this.onMousemove)
		window.addEventListener('mouseup', this.onMouseup)

		const viewRect = this.$el.getBoundingClientRect()
		this.rawPrevPos = [e.clientX - viewRect.left, e.clientY - viewRect.top]
	}

	private onMousemove(e: MouseEvent) {
		if (!this.handleInfo || !this.handles) {
			return
		}

		const onDrag = this.handleInfo[K_ON_DRAG]

		if (typeof onDrag !== 'function') {
			return
		}

		const viewRect = this.$el.getBoundingClientRect()
		const rawPos = markMalVector([
			e.clientX - viewRect.left,
			e.clientY - viewRect.top
		]) as number[]

		const pos = [0, 0]
		vec2.transformMat2d(pos as vec2, rawPos as vec2, this.transformInv)
		markMalVector(pos)

		const prevPos = [0, 0]
		vec2.transformMat2d(
			prevPos as vec2,
			this.rawPrevPos as vec2,
			this.transformInv
		)
		markMalVector(prevPos)

		const deltaPos = markMalVector([pos[0] - prevPos[0], pos[1] - prevPos[1]])

		const eventInfo = {
			[K_ID]: this.draggingId === undefined ? null : this.draggingId,
			[K_POS]: pos,
			[K_PREV_POS]: prevPos,
			[K_DELTA_POS]: deltaPos
		}

		this.rawPrevPos = rawPos

		let newParams = onDrag(
			eventInfo,
			this.params,
			this.evaluatedParams
		) as MalVal[]

		if (newParams) {
			if (newParams[0] === K_CHANGE_ID) {
				this.draggingId = newParams[1]
				newParams = newParams[2] as MalVal[]
			}

			const newExp = [(this.exp as any[])[0], ...newParams]
			this.$emit('input', newExp)
		}
	}

	private onMouseup() {
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
		vector-effect non-scaling-stroke
		fill var(--background)

		&:not(.guide):hover
			stroke-width 3
			fill var(--blue)

	path
		stroke var(--blue)
		vector-effect non-scaling-stroke
		fill none

		&.axis-x, &.axis-y
			stroke-width

		&.axis-x
			stroke var(--red)
		&.axis-y
			stroke var(--green)

	.path
		&:not(.guide):hover .path__display
			stroke-width 3

		&__hover-zone
			stroke transparent
			stroke-width 20

	// Dash
	circle.dashed
		stroke-dasharray 3 2
		&:hover
			stroke-dasharray none

	.path.dashed
		stroke-dasharray 3 2

		&:not(.guide):hover
			stroke-dasharray none
</style>
