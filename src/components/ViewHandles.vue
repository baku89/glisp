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
			<path class="ViewHandles__viewport-axis stroke" d="M -50000 0 H 50000" />
			<path class="ViewHandles__viewport-axis stroke" d="M 0 -50000 V 50000" />
		</g>
		<g
			v-if="handleCallbacks"
			class="ViewHandles__axis"
			:transform="axisTransform"
		>
			<path class="stroke axis-x" marker-end="url(#arrow-x)" d="M 0 0 H 200" />
			<path class="stroke axis-y" marker-end="url(#arrow-y)" d="M 0 0 V 200" />
		</g>
		<path
			class="stroke"
			v-if="selectedPath"
			:d="selectedPath"
			:transform="`matrix(${transform.join(' ')})`"
		/>
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
					d="M 15 0 H -15 M -9 -5 L -15 0 L -9 5 M 9 -5 L 15 0 L 9 5"
				/>
				<template v-if="type === 'translate'">
					<path class="stroke display" d="M 12 0 H -12" />
					<path
						class="stroke display"
						:transform="yTransform"
						d="M 0 12 V -12"
					/>
				</template>
				<circle
					class="fill display"
					:class="cls"
					cx="0"
					cy="0"
					:r="rem * 0.5"
				/>
			</template>
		</g>
	</svg>
</template>

<script lang="ts">
import {
	MalVal,
	keywordFor as K,
	createList as L,
	isMap,
	MalSeq,
	MalMap,
	MalFunc,
	isVector,
	getEvaluated,
	malEquals,
} from '@/mal/types'
import {mat2d, vec2} from 'gl-matrix'
import {getSVGPathData} from '@/path-utils'
import {
	getFnInfo,
	FnInfoType,
	getMapValue,
	reverseEval,
	computeExpTransform,
} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'
import {useRem, useGesture} from '@/components/use'
import {
	defineComponent,
	computed,
	reactive,
	toRefs,
	onBeforeMount,
	ref,
	SetupContext,
	Ref,
} from '@vue/composition-api'
import {isPath} from '@/path-utils'
import ConsoleScope from '@/scopes/console'
import AppScope from '@/scopes/app'

const K_ANGLE = K('angle'),
	K_ID = K('id'),
	K_GUIDE = K('guide'),
	K_POS = K('pos'),
	K_TYPE = K('type'),
	K_DRAW = K('draw'),
	K_DRAG = K('drag'),
	K_CHANGE_ID = K('change-id'),
	K_PATH = K('path'),
	K_CLASS = K('class'),
	K_PREV_POS = K('prev-pos'),
	K_PARAMS = K('params'),
	K_RETURN = K('return'),
	K_REPLACE = K('replace')

interface ClassList {
	[name: string]: true
}

interface Handle {
	type: string
	cls: ClassList
	id: MalVal
	guide: boolean
	transform: string
	yTransform?: string
	path?: string
}

interface Data {
	draggingIndex: number | null
	rawPrevPos: number[]
	fnInfo: FnInfoType | null
	handleCallbacks: MalMap | null
	params: MalVal[]
	unevaluatedParams: MalVal[]
	returnedValue: MalVal
	selectedPath: string | null
	transform: mat2d
	transformInv: mat2d
	axisTransform: string
	handles: Handle[]
}

interface Props {
	exp: NonReactive<MalSeq> | null
	viewTransform: mat2d
}

const POINTABLE_HANDLE_TYPES = new Set(['translate', 'arrow', 'dia', 'point'])

export default defineComponent({
	props: {
		exp: {
			required: true,
			// validator: v => v instanceof NonReactive,
		},
		viewTransform: {
			type: Float32Array,
			default: () => mat2d.identity(mat2d.create()),
		},
	},
	setup(props: Props, context: SetupContext) {
		const el: Ref<HTMLElement | null> = ref(null)

		const data = reactive({
			draggingIndex: null,
			rawPrevPos: [0, 0],
			fnInfo: computed(() => {
				return props.exp ? getFnInfo(props.exp.value) : null
			}),
			handleCallbacks: computed(() => {
				if (data.fnInfo) {
					const ret = getMapValue(data.fnInfo.meta, 'handles')
					return isMap(ret) ? ret : null
				} else {
					return null
				}
			}),
			params: computed(() => {
				if (!props.exp || !data.handleCallbacks) return []

				const exp = props.exp.value
				if (data.fnInfo?.primitive) {
					return [getEvaluated(exp)]
				} else {
					return exp.slice(1).map(getEvaluated) || []
				}
			}),
			unevaluatedParams: computed(() => {
				if (!props.exp || !data.handleCallbacks) return []

				const exp = props.exp.value
				if (data.fnInfo?.primitive) {
					return [exp]
				} else {
					return exp.slice(1)
				}
			}),
			returnedValue: computed(() => {
				return props.exp ? getEvaluated(props.exp.value) : null
			}),
			transform: computed(() => {
				if (!props.exp) {
					return props.viewTransform
				}
				const xform = computeExpTransform(props.exp.value)

				// pre-multiplies with viewTransform
				mat2d.multiply(xform, props.viewTransform as mat2d, xform)

				return xform
			}),
			transformInv: computed(() =>
				mat2d.invert(mat2d.create(), data.transform)
			),
			selectedPath: computed(() => {
				if (!props.exp) return null

				const evaluated = getEvaluated(props.exp.value)
				if (!isPath(evaluated)) return

				return getSVGPathData(evaluated)
			}),
			axisTransform: computed(() => `matrix(${data.transform.join(',')})`),
			handles: computed(() => {
				if (!data.handleCallbacks) return []

				const drawHandle = data.handleCallbacks[K_DRAW] as MalFunc

				if (typeof drawHandle !== 'function') {
					return null
				}

				const options = {
					[K_PARAMS]: data.params,
					[K_RETURN]: data.returnedValue,
				}

				let handles
				try {
					handles = drawHandle(options)
				} catch (err) {
					console.error('ViewHandles draw', err)
					return null
				}

				if (!isVector(handles)) {
					return null
				}

				return handles.map((h: any) => {
					const type = h[K_TYPE] as string
					const guide = !!h[K_GUIDE]
					const classList = ((h[K_CLASS] as string) || '').split(' ')
					const cls = {} as ClassList
					for (const name of classList) {
						cls[name] = true
					}

					const xform = mat2d.clone(data.transform)
					let yRotate = 0

					if (POINTABLE_HANDLE_TYPES.has(type)) {
						const [x, y] = h[K_POS]
						mat2d.translate(xform, xform, [x, y])
					}

					if (type === 'arrow') {
						const angle = h[K_ANGLE] || 0
						mat2d.rotate(xform, xform, angle)
					} else if (type === 'dia') {
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
					}

					if (type === 'translate') {
						ret.yTransform = `rotate(${(yRotate * 180) / Math.PI})`
					} else if (type === 'path') {
						ret.path = getSVGPathData(h[K_PATH])
					}

					return ret
				})
			}),
		}) as Data

		function onMousedown(i: number, e: MouseEvent) {
			if (!el.value) return

			const type = data.handles[i] && data.handles[i].type

			data.draggingIndex = i
			const {left, top} = el.value.getBoundingClientRect()
			data.rawPrevPos = [e.clientX - left, e.clientY - top]

			if (type !== 'bg') {
				window.addEventListener('mousemove', onMousedrag)
				window.addEventListener('mouseup', onMouseup)
			} else {
				onMousedrag(e)
			}
		}

		function onMousedrag(e: MouseEvent) {
			if (
				!props.exp ||
				!data.handleCallbacks ||
				data.draggingIndex === null ||
				!el.value
			) {
				return
			}

			const dragHandle = data.handleCallbacks[K_DRAG]

			if (typeof dragHandle !== 'function') {
				return
			}

			const viewRect = el.value.getBoundingClientRect()
			const rawPos = [e.clientX - viewRect.left, e.clientY - viewRect.top]

			const pos = [0, 0]
			vec2.transformMat2d(pos as vec2, rawPos as vec2, data.transformInv)

			const prevPos = [0, 0]
			vec2.transformMat2d(
				prevPos as vec2,
				data.rawPrevPos as vec2,
				data.transformInv
			)

			const handle = data.handles[data.draggingIndex]

			const eventInfo = {
				[K_ID]: handle.id === undefined ? null : handle.id,
				[K_POS]: pos,
				[K_PREV_POS]: prevPos,
				[K_PARAMS]: data.params,
			} as MalMap

			data.rawPrevPos = rawPos

			let result: MalVal
			try {
				result = dragHandle(eventInfo)
			} catch (err) {
				console.error('ViewHandles onDrag', err)
				return null
			}

			if (!isVector(result) && !isMap(result)) {
				return null
			}

			// Parse the result
			let newParams: MalVal[]
			let updatedIndices: number[] | undefined = undefined

			if (isMap(result)) {
				const params = result[K_PARAMS]
				const replace = result[K_REPLACE]
				const changeId = result[K_CHANGE_ID]

				if (isVector(params)) {
					newParams = params
				} else if (isVector(replace)) {
					newParams = [...data.unevaluatedParams]
					const pairs = (typeof replace[0] === 'number'
						? [(replace as any) as [number, MalVal]]
						: ((replace as any) as [number, MalVal][])
					).map(
						([si, e]) =>
							[si < 0 ? newParams.length + si : si, e] as [number, MalVal]
					)
					for (const [i, value] of pairs) {
						newParams[i] = value
					}
					updatedIndices = pairs.map(([i]) => i)
				} else {
					return null
				}

				if (isVector(changeId)) {
					const newId = newParams[1]
					data.draggingIndex = data.handles.findIndex(h =>
						malEquals(h.id, newId)
					)
				}
			} else {
				newParams = result
			}

			if (!updatedIndices) {
				updatedIndices = Array(newParams.length)
					.fill(0)
					.map((_, i) => i)
			}

			// Execute the backward evaluation
			for (const i of updatedIndices) {
				let newValue = newParams[i]
				const unevaluated = data.unevaluatedParams[i]

				// if (malEquals(newValue, this.params[i])) {
				// 	newValue = unevaluated
				// }

				newValue = reverseEval(newValue, unevaluated)
				newParams[i] = newValue
			}

			// Construct the new expression and send it to parent
			const newExp: MalSeq = data.fnInfo?.primitive
				? (newParams[0] as MalSeq)
				: (L(props.exp.value[0], ...newParams) as MalSeq)

			context.emit('input', nonReactive(newExp))
		}

		function onMouseup() {
			data.draggingIndex = null
			unregisterMouseEvents()
		}

		function unregisterMouseEvents() {
			window.removeEventListener('mousemove', onMousedrag)
			window.removeEventListener('mouseup', onMouseup)
		}

		onBeforeMount(() => {
			unregisterMouseEvents()
		})

		// Gestures for view transform
		useGesture(el, {
			onZoom({pageX, pageY, deltaY}: MouseWheelEvent) {
				if (!el.value) return

				const xform = mat2d.clone(props.viewTransform as mat2d)

				// Scale
				const deltaScale = 1 + -deltaY * 0.01

				const {left, top} = el.value.getBoundingClientRect()
				const pivot = vec2.fromValues(pageX - left, pageY - top)

				const xformInv = mat2d.invert(mat2d.create(), xform)
				vec2.transformMat2d(pivot, pivot, xformInv)

				mat2d.translate(xform, xform, pivot)
				mat2d.scale(xform, xform, [deltaScale, deltaScale])

				vec2.negate(pivot, pivot)
				mat2d.translate(xform, xform, pivot)

				context.emit('update:view-transform', xform)
			},
			onScroll({deltaX, deltaY}: MouseWheelEvent) {
				const xform = mat2d.clone(props.viewTransform as mat2d)

				// Translate
				xform[4] -= deltaX / 2
				xform[5] -= deltaY / 2

				context.emit('update:view-transform', xform)
			},
			onGrab({deltaX, deltaY}) {
				if (!el.value) return
				const xform = mat2d.clone(props.viewTransform as mat2d)

				// Translate (pixel by pixel)
				xform[4] += deltaX
				xform[5] += deltaY

				context.emit('update:view-transform', xform)
			},
			onRotate({rotation, pageX, pageY}) {
				if (!el.value) return

				const {left, top} = el.value.getBoundingClientRect()
				const pivot = vec2.fromValues(pageX - left, pageY - top)

				const xform = mat2d.clone(props.viewTransform)

				vec2.transformMat2d(pivot, pivot, mat2d.invert(mat2d.create(), xform))

				// Rotate
				const rad = (rotation * Math.PI) / 180
				const rot = mat2d.fromRotation(mat2d.create(), -rad)

				mat2d.translate(xform, xform, pivot)
				mat2d.mul(xform, xform, rot)
				mat2d.translate(xform, xform, vec2.negate(vec2.create(), pivot))

				context.emit('update:view-transform', xform)
			},
		})

		// Register app commands to ConsoleScope
		AppScope.def('reset-viewport', () => {
			if (!el.value) return null

			const {width, height} = el.value.getBoundingClientRect()

			const xform = mat2d.create()
			mat2d.fromTranslation(xform, vec2.fromValues(width / 2, height / 2))

			context.emit('update:view-transform', xform)

			return null
		})

		// REM
		const rem = useRem()

		return {el, ...toRefs(data as any), onMousedown, rem}
	},
})
</script>

<style lang="stylus" scoped>
.ViewHandles
	position relative
	overflow hidden
	height 100%

	.fill, .stroke
		stroke var(--highlight)
		stroke-width 1
		vector-effect non-scaling-stroke

	.fill
		fill var(--background)

	.stroke
		stroke var(--highlight)
		vector-effect non-scaling-stroke
		fill none

	&__viewport-axis
		stroke var(--guide) !important
		stroke-dasharray 1 4

	// Hover behavior
	*[hoverrable]:hover, *[dragging]
		.stroke.display
			stroke-width 3

		.fill.display
			fill var(--highlight)

		&.dashed
			stroke-dasharray none

	e, .hover-zone
		stroke transparent
		stroke-width 20

	// Classes
	.dashed
		stroke-dasharray 3 2

	.axis-x, .axis-y
		opacity 0.5

	.axis-x, .axis-x .display
		stroke var(--red) !important

	.axis-y, .axis-y .display
		stroke var(--green) !important
</style>
