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
		<g
			v-if="handleCallbacks"
			class="ViewHandles__axis"
			:transform="axisTransform"
		>
			<path class="axis-x" marker-end="url(#arrow-x)" d="M 0 0 H 200" />
			<path class="axis-y" marker-end="url(#arrow-y)" d="M 0 0 V 200" />
		</g>
		<g
			v-for="({type, id, transform, yTransform, path, cls, guide},
			i) in handles"
			:key="i"
			:class="cls"
			:hoverrable="draggingIndex === null && !guide"
			:dragging="draggingIndex === i"
			:transform="transform"
			@mousedown="!guide && onMousedown(i, $event)"
		>
			<template v-if="type === 'path'">
				<path class="hover-zone" :d="path" />
				<path class="display" :d="path" />
			</template>
			<template v-else>
				<path
					v-if="type === 'arrow'"
					class="display"
					d="M 20 0 H -20 M -14 -5 L -20 0 L -14 5 M 14 -5 L 20 0 L 14 5"
				/>
				<template v-if="cls.translate">
					<path class="display" d="M 12 0 H -12" />
					<path class="display" :transform="yTransform" d="M 0 12 V -12" />
				</template>
				<circle class="display" :class="cls" cx="0" cy="0" :r="rem * 0.5" />
			</template>
		</g>
	</svg>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {
	MalVal,
	keywordFor as K,
	symbolFor as S,
	markMalVector as V,
	M_EVAL,
	M_OUTER,
	isMap,
	MalNode,
	MalNodeList,
	M_EVAL_PARAMS,
	isMalNode,
	isList,
	M_OUTER_INDEX,
	MalMap,
	MalFunc
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {getSVGPathData} from '@/mal-lib/path'
import {fnInfo} from '@/mal-utils'
import {NonReactive} from '../utils'

const K_ANGLE = K('angle'),
	K_HANDLES = K('handles'),
	K_ID = K('id'),
	K_GUIDE = K('guide'),
	K_POS = K('pos'),
	K_TYPE = K('type'),
	K_TRANSFORM = K('transform'),
	K_DRAW = K('draw'),
	K_DRAG = K('drag'),
	K_CHANGE_ID = K('change-id'),
	K_PATH = K('path'),
	K_CLASS = K('class')

@Component({})
export default class ViewHandles extends Vue {
	@Prop({required: true}) exp!: NonReactive<MalNodeList>

	private rem = 0

	private get fnInfo() {
		return fnInfo(this.exp.value)
	}

	private get handleCallbacks() {
		if (this.fnInfo && isMap(this.fnInfo.meta)) {
			const handles = this.fnInfo.meta[K_HANDLES]
			return isMap(handles) ? handles : null
		} else {
			return null
		}
	}

	private get unevaluatedParams(): MalVal[] {
		if (this.handleCallbacks) {
			const exp = this.exp.value
			if (this.fnInfo?.primitive) {
				return [[...exp]]
			} else {
				return exp.slice(1)
			}
		} else {
			return []
		}
	}

	private get params(): MalVal[] {
		if (this.handleCallbacks) {
			const exp = this.exp.value
			if (this.fnInfo?.primitive) {
				return [exp[M_EVAL]]
			} else {
				return exp[M_EVAL_PARAMS] || []
			}
		}
		return []
	}

	private get returnedValue(): MalVal {
		return this.exp.value[M_EVAL] || null
	}

	private get transformInv() {
		return mat2d.invert(mat2d.create(), this.transform)
	}

	private get transform() {
		const exp = this.exp

		if (!isMalNode(this.exp.value)) {
			return mat2d.create()
		}

		// Collect ancestors
		let ancestors: MalNode[] = []
		for (let outer: MalNode = exp.value; outer; outer = outer[M_OUTER]) {
			ancestors.unshift(outer)
		}

		const attrMatrices: MalVal[] = []

		// If the exp is nested inside transform arguments
		for (let i = ancestors.length - 1; 0 < i; i--) {
			const node = ancestors[i]
			const outer = ancestors[i - 1]

			if (!isList(outer)) {
				continue
			}

			const isAttrOfG =
				outer[0] === S('g') &&
				outer[1] === node &&
				isMap(node) &&
				K_TRANSFORM in node

			const isAttrOfTransform = outer[0] === S('transform') && outer[1] === node
			const isAttrOfPathTransform =
				outer[0] === S('path/transform') && outer[1] === node

			if (isAttrOfG || isAttrOfTransform || isAttrOfPathTransform) {
				// Exclude attributes' part from ancestors
				const attrAncestors = ancestors.slice(i)
				ancestors = ancestors.slice(0, i - 1)

				// Calculate transform compensation inside attribute
				for (let j = attrAncestors.length - 1; 0 < j; j--) {
					const node = attrAncestors[j]
					const outer = attrAncestors[j - 1]

					if (isList(outer)) {
						if (outer[0] === S('mat2d/*')) {
							// Prepend matrices
							const matrices = outer.slice(1, node[M_OUTER_INDEX])
							attrMatrices.unshift(...matrices)
						} else if (outer[0] === S('pivot')) {
							// Prepend matrices
							const matrices = outer.slice(2, node[M_OUTER_INDEX])
							attrMatrices.unshift(...matrices)

							// Append pivot itself as translation matrix
							const pivot =
								isMalNode(outer[1]) && M_EVAL in outer[1]
									? (outer[1][M_EVAL] as vec2)
									: vec2.create()

							const pivotMat = mat2d.fromTranslation(mat2d.create(), pivot)

							attrMatrices.unshift(pivotMat as number[])
						}
					}
				}

				break
			}
		}

		// Extract the matrices from ancestors
		const matrices = ancestors.reduce((filtered, node) => {
			if (isList(node)) {
				if (node[0] === S('g') && isMap(node[1]) && K_TRANSFORM in node[1]) {
					const matrix = node[1][K_TRANSFORM]
					filtered.push(matrix)
				} else if (node[0] === S('artboard')) {
					const bounds = (node[1] as MalMap)[K('bounds')] as number[]
					const matrix = [1, 0, 0, 1, ...bounds.slice(0, 2)]
					filtered.push(matrix)
				} else if (
					node[0] === S('transform') ||
					node[0] === S('path/transform')
				) {
					const matrix = node[1]
					filtered.push(matrix)
				}
			}

			return filtered
		}, [] as MalVal[])

		// Append attribute matrices
		matrices.push(...attrMatrices)

		// Multiplies all matrices in order
		const ret = (matrices.map(xform =>
			isMalNode(xform) && M_EVAL in xform ? xform[M_EVAL] : xform
		) as mat2d[]).reduce(
			(xform, elXform) => mat2d.multiply(xform, xform, elXform),
			mat2d.create()
		)

		return ret
	}

	private get axisTransform() {
		return `matrix(${this.transform.join(',')})`
	}

	private get handles() {
		if (this.handleCallbacks) {
			const drawHandle = this.handleCallbacks[K_DRAW] as MalFunc

			const options = {
				[K('params')]: this.params,
				[K('return')]: this.returnedValue,
				[K('unevaluated-params')]: this.unevaluatedParams
			}

			let handles
			try {
				handles = drawHandle(options)
			} catch (err) {
				console.error('ViewHandles draw', err)
				return null
			}

			if (!Array.isArray(handles)) {
				return null
			}

			return handles.map((h: any) => {
				const type = h[K_TYPE]
				const guide = !!h[K_GUIDE]
				const classList = ((h[K_CLASS] as string) || '').split(' ')
				const cls = {} as {[name: string]: true}
				for (const name of classList) {
					cls[name] = true
				}

				const xform = mat2d.clone(this.transform)
				let yRotate = 0

				if (type === 'point' || type === 'arrow') {
					const [x, y] = h[K_POS]
					mat2d.translate(xform, xform, [x, y])
				}

				if (type === 'arrow') {
					const angle = h[K_ANGLE] || 0
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
					if (cls['translate']) {
						const perpAxisYAngle = Math.atan2(axis[1], axis[0])
						vec2.rotate(axis, origAxisY, [0, 0], -perpAxisYAngle)
						yRotate = Math.atan2(axis[1], axis[0])
					}
				}

				const ret: {[k: string]: string | boolean | object} = {
					type,
					cls,
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

	private draggingIndex: number | null = null

	private rawPrevPos!: number[]

	private onMousedown(i: number, e: MouseEvent) {
		this.draggingIndex = i
		window.addEventListener('mousemove', this.onMousemove)
		window.addEventListener('mouseup', this.onMouseup)

		const viewRect = this.$el.getBoundingClientRect()
		this.rawPrevPos = [e.clientX - viewRect.left, e.clientY - viewRect.top]
	}

	private onMousemove(e: MouseEvent) {
		if (!this.handleCallbacks || !this.handles || this.draggingIndex === null) {
			return
		}

		const dragHandle = this.handleCallbacks[K_DRAG]

		if (typeof dragHandle !== 'function') {
			return
		}

		const viewRect = this.$el.getBoundingClientRect()
		const rawPos = V([
			e.clientX - viewRect.left,
			e.clientY - viewRect.top
		]) as number[]

		const pos = V([0, 0]) as number[]
		vec2.transformMat2d(pos as vec2, rawPos as vec2, this.transformInv)

		const prevPos = V([0, 0]) as number[]
		vec2.transformMat2d(
			prevPos as vec2,
			this.rawPrevPos as vec2,
			this.transformInv
		)

		const deltaPos = V([pos[0] - prevPos[0], pos[1] - prevPos[1]])

		const handle = this.handles[this.draggingIndex]

		const eventInfo = {
			[K_ID]: handle.id === undefined ? null : handle.id,
			[K_POS]: pos,
			[K('prev-pos')]: prevPos,
			[K('delta-pos')]: deltaPos,
			[K('unevaluated-params')]: this.unevaluatedParams,
			[K('params')]: this.params
		} as MalMap

		this.rawPrevPos = rawPos

		let newParams: MalVal[]
		try {
			newParams = dragHandle(eventInfo) as MalVal[]
		} catch (err) {
			console.error('ViewHandles onDrag', err)
			return null
		}

		if (newParams) {
			if (newParams[0] === K_CHANGE_ID) {
				const newId = newParams[1]
				this.draggingIndex = this.handles.findIndex(h => h.id === newId)
				newParams = newParams[2] as MalVal[]
			}

			const newExp: MalNodeList = this.fnInfo?.primitive
				? (newParams[0] as MalNodeList)
				: ([this.exp.value[0], ...newParams] as MalNodeList)

			this.$emit('input', newExp)
		}
	}

	private onMouseup() {
		this.draggingIndex = null
		this.unregisterMouseEvents()
	}
}
</script>

<style lang="stylus" scoped>
.ViewHandles
	position relative
	overflow hidden
	height 100% a

	circle, path
		stroke var(--blue)
		stroke-width 1
		vector-effect non-scaling-stroke

	circle
		fill var(--background)

	path
		stroke var(--blue)
		vector-effect non-scaling-stroke
		fill none


	// Hover behavior
	*[hoverrable]:hover, *[dragging]
		path.display
			stroke-width 3

		circle.display
			fill var(--blue)

		&.dashed
			stroke-dasharray none

	e, .hover-zone
		stroke transparent
		stroke-width 20

	// Classes
	.dashed
		stroke-dasharray 3 2

	.axis-x, .axis-x .display
		stroke var(--red) !important

	.axis-y, .axis-y .display
		stroke var(--green) !important
</style>
