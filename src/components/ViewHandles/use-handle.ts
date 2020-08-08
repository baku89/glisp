import {
	copyDelimiters,
	reverseEval,
	getFnInfo,
	computeExpTransform,
	getMapValue,
	FnInfoType,
	replaceExp,
} from '@/mal/utils'
import {
	MalSeq,
	getEvaluated,
	isMap,
	MalMap,
	MalVal,
	keywordFor as K,
	MalFunc,
	isVector,
	malEquals,
	createList as L,
} from '@/mal/types'
import {
	reactive,
	computed,
	Ref,
	onBeforeMount,
	SetupContext,
	toRefs,
} from '@vue/composition-api'
import {getSVGPathData, getSVGPathDataRecursive} from '@/path-utils'
import {vec2, mat2d} from 'gl-matrix'
import {NonReactive} from '@/utils'

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

const POINTABLE_HANDLE_TYPES = new Set(['translate', 'arrow', 'dia', 'point'])

interface HandleData {
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
	transformStyle: string
	handles: Handle[]
}

export default function useHandle(
	exp: Ref<NonReactive<MalSeq> | null>,
	viewTransform: Ref<mat2d>,
	el: Ref<HTMLElement | null>,
	context: SetupContext
) {
	const data = reactive({
		draggingIndex: null,
		rawPrevPos: [0, 0],
		fnInfo: computed(() => {
			return exp.value ? getFnInfo(exp.value.value) : null
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
			if (!exp.value || !data.handleCallbacks) return []

			const expValue = exp.value.value
			if (data.fnInfo?.structType) {
				return [getEvaluated(expValue)]
			} else {
				return expValue.slice(1).map(e => getEvaluated(e)) || []
			}
		}),
		unevaluatedParams: computed(() => {
			if (!exp.value || !data.handleCallbacks) return []

			const expValue = exp.value.value
			if (data.fnInfo?.structType) {
				return [expValue]
			} else {
				return expValue.slice(1)
			}
		}),
		returnedValue: computed(() => {
			return exp.value ? getEvaluated(exp.value.value) : null
		}),
		transform: computed(() => {
			if (!exp.value) return viewTransform.value

			const xform = computeExpTransform(exp.value.value)

			// pre-multiplies with viewTransform
			mat2d.multiply(xform, viewTransform.value as mat2d, xform)

			return xform
		}),
		transformInv: computed(() => mat2d.invert(mat2d.create(), data.transform)),
		selectedPath: computed(() => {
			if (!exp.value) return ''

			const evaluated = getEvaluated(exp.value.value)
			return getSVGPathDataRecursive(evaluated)
		}),
		transformStyle: computed(() => `matrix(${data.transform.join(',')})`),
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
	}) as HandleData

	function onMousedown(i: number, e: MouseEvent) {
		if (!el.value) return

		data.draggingIndex = i
		const {left, top} = el.value.getBoundingClientRect()
		data.rawPrevPos = [e.clientX - left, e.clientY - top]

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	function onMousedrag(e: MouseEvent) {
		if (
			!exp.value ||
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
				data.draggingIndex = data.handles.findIndex(h => malEquals(h.id, newId))
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
		const newExp: MalSeq = data.fnInfo?.structType
			? (newParams[0] as MalSeq)
			: (L(exp.value.value[0], ...newParams) as MalSeq)

		// Copy the delimiter if possible
		copyDelimiters(newExp, exp.value.value)

		// Finally replaces the sexp
		replaceExp(exp.value.value, newExp)
	}

	function onMouseup() {
		data.draggingIndex = null
		unregisterMouseEvents()
		context.emit('tag-history', 'undo')
	}

	function unregisterMouseEvents() {
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	onBeforeMount(() => {
		unregisterMouseEvents()
	})

	return {
		...toRefs(data as any),
		onMousedown,
	}
}
