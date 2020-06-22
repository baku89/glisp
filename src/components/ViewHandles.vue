<template>
	<svg class="ViewHandles" ref="el">
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
				<path class="stroke axis-x" d="M 0 0 L 10 5 L 0 10" />
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
				<path class="stroke axis-y" d="M 0 0 L 10 5 L 0 10" />
			</marker>
		</defs>
		<g :transform="`matrix(${viewTransform.join(' ')})`">
			<path class="ViewHandles__viewport-axis stroke" d="M -5000 0 H 5000" />
			<path class="ViewHandles__viewport-axis stroke" d="M 0 -5000 V 5000" />
		</g>
		<g v-if="handleCallbacks" class="ViewHandles__axis" :transform="axisTransform">
			<path class="stroke axis-x" marker-end="url(#arrow-x)" d="M 0 0 H 200" />
			<path class="stroke axis-y" marker-end="url(#arrow-y)" d="M 0 0 V 200" />
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
				<path class="stroke hover-zone" :d="path" />
				<path class="stroke display" :d="path" />
			</template>
			<template v-else-if="type === 'bg'">
				<rect x="0" y="0" width="10000" height="10000" fill="transparent" />
			</template>
			<template v-else-if="type === 'dia'">
				<path class="fill display" d="M 7 0 L 0 7 L -7 0 L 0 -7 Z" />
			</template>
			<template v-else>
				<path
					v-if="type === 'arrow'"
					class="stroke display"
					d="M 20 0 H -20 M -14 -5 L -20 0 L -14 5 M 14 -5 L 20 0 L 14 5"
				/>
				<template v-if="type === 'translate'">
					<path class="stroke display" d="M 12 0 H -12" />
					<path class="stroke display" :transform="yTransform" d="M 0 12 V -12" />
				</template>
				<circle class="fill display" :class="cls" cx="0" cy="0" :r="rem * 0.5" />
			</template>
		</g>
	</svg>
</template>

<script lang="ts">
import {
	MalVal,
	keywordFor as K,
	symbolFor as S,
	markMalVector as V,
	M_EVAL,
	M_OUTER,
	isMap,
	MalNode,
	MalNodeSeq,
	M_EVAL_PARAMS,
	isMalNode,
	isList,
	M_OUTER_INDEX,
	MalMap,
	MalFunc,
	M_FN,
	getType,
	isMalFunc,
	getMeta,
	isVector,
	MalSymbol,
	isSymbol,
	isSeq
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {getSVGPathData} from '@/mal-lib/path'
import {getFnInfo, FnInfoType, getMapValue, reverseEval} from '@/mal-utils'
import {NonReactive, nonReactive} from '@/utils'
import {
	defineComponent,
	computed,
	reactive,
	toRefs,
	onMounted,
	onBeforeMount,
	ref,
	SetupContext,
	Ref
} from '@vue/composition-api'
import {replaceExp} from '@/mal/eval'

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

interface ClassList {
	[name: string]: true
}

interface Handle {
	type: string
	cls: ClassList
	id: MalVal
	guide: boolean
	transform: string
	yTransform: string
	path?: string
}

interface Data {
	rem: number
	draggingIndex: number | null
	rawPrevPos: number[]
	fnInfo: FnInfoType | null
	handleCallbacks: MalMap | null
	params: MalVal[]
	unevaluatedParams: MalVal[]
	returnedValue: MalVal
	transform: mat2d
	transformInv: mat2d
	axisTransform: string
	handles: Handle[]
}

interface Prop {
	exp: NonReactive<MalNodeSeq> | null
	viewTransform: Float32Array
}

interface UseGestureOptions {
	onScroll?: (e: MouseWheelEvent) => any
}

function useGesture(el: Ref<HTMLElement | null>, options: UseGestureOptions) {
	onMounted(() => {
		if (!el.value) return

		if (options.onScroll) {
			el.value.addEventListener('wheel', options.onScroll)
		}
	})
}

export default defineComponent({
	props: {
		exp: {
			required: true,
			validator: v => typeof v === 'object'
		},
		viewTransform: {
			type: Float32Array,
			default: () => mat2d.identity(mat2d.create())
		}
	},
	setup(prop: Prop, context: SetupContext) {
		const el: Ref<HTMLElement | null> = ref(null)

		const state = reactive({
			rem: 0,
			draggingIndex: null,
			rawPrevPos: [0, 0],
			fnInfo: computed(() => {
				return prop.exp ? getFnInfo(prop.exp.value) : null
			}),
			handleCallbacks: computed(() => {
				if (state.fnInfo) {
					const ret = getMapValue(state.fnInfo.meta, 'handles')
					return isMap(ret) ? ret : null
				} else {
					return null
				}
			}),
			params: computed(() => {
				if (!prop.exp || !state.handleCallbacks) return []

				const exp = prop.exp.value
				if (state.fnInfo?.primitive) {
					return [exp[M_EVAL]]
				} else {
					return exp[M_EVAL_PARAMS] || []
				}
			}),
			unevaluatedParams: computed(() => {
				if (!prop.exp || !state.handleCallbacks) return []

				const exp = prop.exp.value
				if (state.fnInfo?.primitive) {
					return [[...exp]]
				} else {
					return exp.slice(1)
				}
			}),
			returnedValue: computed(() => {
				return prop.exp ? prop.exp.value[M_EVAL] || null : null
			}),
			transform: computed(() => {
				if (!prop.exp) return prop.viewTransform

				const exp = prop.exp.value

				if (!isMalNode(exp)) {
					return mat2d.create()
				}

				// Collect ancestors
				let ancestors: MalNode[] = []
				for (let outer: MalNode = exp; outer; outer = outer[M_OUTER]) {
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

					const isAttrOfTransform =
						outer[0] === S('transform') && outer[1] === node
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
						if (
							node[0] === S('g') &&
							isMap(node[1]) &&
							K_TRANSFORM in node[1]
						) {
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

				// pre-multiplies with viewTransform
				mat2d.multiply(ret, prop.viewTransform as mat2d, ret)

				return ret
			}),
			transformInv: computed(() =>
				mat2d.invert(mat2d.create(), state.transform)
			),
			axisTransform: computed(() => `matrix(${state.transform.join(',')})`),
			handles: computed(() => {
				if (!state.handleCallbacks) return []

				const drawHandle = state.handleCallbacks[K_DRAW] as MalFunc

				const options = {
					[K('params')]: state.params,
					[K('return')]: state.returnedValue,
					[K('unevaluated-params')]: state.unevaluatedParams
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
					const cls = {} as ClassList
					for (const name of classList) {
						cls[name] = true
					}

					const xform = mat2d.clone(state.transform)
					let yRotate = 0

					if (/^point|arrow|translate|dia$/.test(type)) {
						const [x, y] = h[K_POS]
						mat2d.translate(xform, xform, [x, y])
					}

					if (type === 'arrow') {
						const angle = h[K_ANGLE] || 0
						mat2d.rotate(xform, xform, angle)
					}

					if (type === 'dia') {
						xform[0] = 1
						xform[1] = 0
						xform[2] = 0
						xform[3] = 1
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
						if (type === 'translate') {
							const perpAxisYAngle = Math.atan2(axis[1], axis[0])
							vec2.rotate(axis, origAxisY, [0, 0], -perpAxisYAngle)
							yRotate = Math.atan2(axis[1], axis[0])
						}
					}

					const ret: Handle = {
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
			})
		}) as Data

		function onMousedown(i: number, e: MouseEvent) {
			if (!el.value) return

			const type = state.handles[i] && state.handles[i].type

			state.draggingIndex = i
			const {left, top} = el.value.getBoundingClientRect()
			state.rawPrevPos = [e.clientX - left, e.clientY - top]

			if (type !== 'bg') {
				window.addEventListener('mousemove', onMousemove)
				window.addEventListener('mouseup', onMouseup)
			} else {
				onMousemove(e)
			}
		}

		function onMousemove(e: MouseEvent) {
			if (
				!prop.exp ||
				!state.handleCallbacks ||
				state.draggingIndex === null ||
				!el.value
			) {
				return
			}

			const dragHandle = state.handleCallbacks[K_DRAG]

			if (typeof dragHandle !== 'function') {
				return
			}

			const viewRect = el.value.getBoundingClientRect()
			const rawPos = V([
				e.clientX - viewRect.left,
				e.clientY - viewRect.top
			]) as number[]

			const pos = V([0, 0]) as number[]
			vec2.transformMat2d(pos as vec2, rawPos as vec2, state.transformInv)

			const prevPos = V([0, 0]) as number[]
			vec2.transformMat2d(
				prevPos as vec2,
				state.rawPrevPos as vec2,
				state.transformInv
			)

			const deltaPos = V([pos[0] - prevPos[0], pos[1] - prevPos[1]])

			const handle = state.handles[state.draggingIndex]

			const eventInfo = {
				[K_ID]: handle.id === undefined ? null : handle.id,
				[K_POS]: pos,
				[K('prev-pos')]: prevPos,
				[K('delta-pos')]: deltaPos,
				[K('unevaluated-params')]: state.unevaluatedParams,
				[K('params')]: state.params
			} as MalMap

			state.rawPrevPos = rawPos

			let newParams: MalVal[]
			try {
				newParams = dragHandle(eventInfo) as MalVal[]
			} catch (err) {
				console.error('ViewHandles onDrag', err)
				return null
			}

			if (!newParams) {
				return
			}

			if (newParams[0] === K_CHANGE_ID) {
				const newId = newParams[1]
				state.draggingIndex = state.handles.findIndex(h => h.id === newId)
				newParams = newParams[2] as MalVal[]
			}

			for (let i = 0; i < newParams.length; i++) {
				let newValue = newParams[i]
				const unevaluated = state.unevaluatedParams[i] as MalVal[]

				// if (malEquals(newValue, this.params[i])) {
				// 	newValue = unevaluated
				// }

				newValue = reverseEval(newValue, unevaluated)

				newParams[i] = newValue
			}

			const newExp: MalNodeSeq = state.fnInfo?.primitive
				? (newParams[0] as MalNodeSeq)
				: ([prop.exp.value[0], ...newParams] as MalNodeSeq)

			context.emit('input', nonReactive(newExp))
		}

		function onMouseup() {
			state.draggingIndex = null
			unregisterMouseEvents()
		}

		function unregisterMouseEvents() {
			window.removeEventListener('mousemove', onMousemove)
			window.removeEventListener('mouseup', onMouseup)
		}

		onBeforeMount(() => {
			unregisterMouseEvents()
		})

		// REM
		const rem = ref(0)
		onMounted(() => {
			rem.value = parseFloat(
				getComputedStyle(document.documentElement).fontSize
			)
		})

		// Gestures for view transform
		useGesture(el, {
			onScroll(e: MouseWheelEvent) {
				if (!el.value) return

				e.stopPropagation()
				e.preventDefault()

				const {deltaX, deltaY} = e

				const xform = mat2d.clone(prop.viewTransform as mat2d)

				if (e.ctrlKey) {
					// Scale
					const deltaScale = 1 + -e.deltaY * 0.01
					const {left, top} = el.value.getBoundingClientRect()
					const pivot = vec2.fromValues(e.pageX - left, e.pageY - top)

					const xformInv = mat2d.invert(mat2d.create(), xform)
					vec2.transformMat2d(pivot, pivot, xformInv)

					mat2d.translate(xform, xform, pivot)
					mat2d.scale(xform, xform, [deltaScale, deltaScale])

					vec2.negate(pivot, pivot)
					mat2d.translate(xform, xform, pivot)
				} else {
					// Translate
					const delta = vec2.fromValues(-deltaX, -deltaY)
					xform[4] -= deltaX / 2
					xform[5] -= deltaY / 2
				}

				context.emit('update:view-transform', xform)
			}
		})

		return {el, ...toRefs(state as any), onMousedown, rem}
	}
})
</script>

<style lang="stylus" scoped>
.ViewHandles
	position relative
	overflow hidden
	height 100%

	.fill, .stroke
		stroke var(--blue)
		stroke-width 1
		vector-effect non-scaling-stroke

	.fill
		fill var(--background)

	.stroke
		stroke var(--blue)
		vector-effect non-scaling-stroke
		fill none

	&__viewport-axis
		stroke var(--border) !important
		stroke-dasharray 2 2

	// Hover behavior
	*[hoverrable]:hover, *[dragging]
		.stroke.display
			stroke-width 3

		.fill.display
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
