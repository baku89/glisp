import {
	copyDelimiters,
	reverseEval,
	getFnInfo,
	computeExpTransform,
	getMapValue,
	replaceExp,
} from '@/mal/utils'
import {
	MalSeq,
	getEvaluated,
	isMap,
	MalMap,
	MalVal,
	keywordFor as K,
	isVector,
	malEquals,
	createList as L,
	MalNode,
} from '@/mal/types'
import {computed, Ref, onBeforeMount, SetupContext, ref} from 'vue'
import {getSVGPathData, getSVGPathDataRecursive} from '@/path-utils'
import {vec2, mat2d} from 'gl-matrix'
import {reconstructTree} from '@/mal/reader'

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

export default function useHandle(
	selectedExp: Ref<MalNode[]>,
	viewTransform: Ref<mat2d>,
	viewEl: Ref<HTMLElement | null>,
	context: SetupContext
) {
	const draggingIndex = ref<[number, number] | null>(null)
	const rawPrevPos = ref([0, 0])
	const fnInfo = computed(() => selectedExp.value.map(e => getFnInfo(e)))
	const handleCallbacks = computed(() =>
		fnInfo.value.map(fi => {
			if (!fi) {
				return undefined
			} else {
				const ret = getMapValue(fi.meta, 'handles')
				return isMap(ret) ? ret : undefined
			}
		})
	)
	const params = computed(() =>
		fnInfo.value.map((fi, i) => {
			const e = selectedExp.value[i]
			if (isMap(e) || !fi) {
				return []
			}
			return fi.structType
				? [getEvaluated(e)]
				: e.slice(1).map(e => getEvaluated(e))
		})
	)
	const unevaluatedParams = computed(() =>
		fnInfo.value.map((fi, i) => {
			const e = selectedExp.value[i]
			if (isMap(e) || !fi) {
				return []
			}
			return fi.structType ? [e] : e.slice(1)
		})
	)
	const returnedValue = computed(() =>
		selectedExp.value.map(e => getEvaluated(e))
	)
	const transform = computed(() =>
		selectedExp.value.map(e => {
			const xform = computeExpTransform(e)
			// pre-multiplies with viewTransform
			mat2d.multiply(xform, viewTransform.value as mat2d, xform)

			return xform
		})
	)
	const transformInv = computed(() =>
		transform.value.map(xform => mat2d.invert(mat2d.create(), xform))
	)
	const transformStyle = computed(() =>
		transform.value.map(xform => `matrix(${xform.join(',')})`)
	)
	const selectedPath = computed(() =>
		returnedValue.value.map(getSVGPathDataRecursive)
	)
	const handles = computed(() =>
		handleCallbacks.value.map((cb, index) => {
			if (!cb) return []

			const drawHandle = cb[K_DRAW]

			if (typeof drawHandle !== 'function') {
				return []
			}

			const options = {
				[K_PARAMS]: params.value[index],
				[K_RETURN]: returnedValue.value[index],
			}

			let handles
			try {
				handles = drawHandle(options)
			} catch (err) {
				console.error('ViewHandles draw', err)
				return []
			}

			if (!isVector(handles)) {
				return []
			}

			return handles.map((h: any) => {
				const type = h[K_TYPE] as string
				const guide = !!h[K_GUIDE]
				const classList = ((h[K_CLASS] as string) || '')
					.split(' ')
					.filter(c => !!c)
				const cls = {} as ClassList
				for (const name of classList) {
					cls[name] = true
				}

				const xform = mat2d.clone(transform.value[index])
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
		})
	)

	function onMousedown(
		[selectedIndex, handleIndex]: [number, number],
		e: MouseEvent
	) {
		if (!viewEl.value) return

		draggingIndex.value = [selectedIndex, handleIndex]
		const {left, top} = viewEl.value.getBoundingClientRect()
		rawPrevPos.value = [e.clientX - left, e.clientY - top]

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	function onMousedrag(e: MouseEvent) {
		if (
			!handleCallbacks.value ||
			draggingIndex.value === null ||
			!viewEl.value
		) {
			return
		}

		const [selectedIndex, handleIndex] = draggingIndex.value
		const cbs = handleCallbacks.value[selectedIndex]

		if (!cbs) {
			return
		}

		const dragHandle = cbs[K_DRAG]

		if (typeof dragHandle !== 'function') {
			return
		}

		const viewRect = viewEl.value.getBoundingClientRect()
		const rawPos = [e.clientX - viewRect.left, e.clientY - viewRect.top]

		const xformInv = transformInv.value[selectedIndex]
		const fi = fnInfo.value[selectedIndex]
		const exp = selectedExp.value[selectedIndex]
		const _params = params.value[selectedIndex]
		const _unevaluatedParams = unevaluatedParams.value[selectedIndex]

		if (!fi || isMap(exp)) {
			return
		}

		const pos = [0, 0]
		vec2.transformMat2d(pos as vec2, rawPos as vec2, xformInv)

		const prevPos = [0, 0]
		vec2.transformMat2d(prevPos as vec2, rawPrevPos.value as vec2, xformInv)

		const handle = handles.value[selectedIndex][handleIndex]

		const eventInfo = {
			[K_ID]: handle.id === undefined ? null : handle.id,
			[K_POS]: pos,
			[K_PREV_POS]: prevPos,
			[K_PARAMS]: _params,
		} as MalMap

		rawPrevPos.value = rawPos

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
			const retParams = result[K_PARAMS]
			const replace = result[K_REPLACE]
			const changeId = result[K_CHANGE_ID]

			if (isVector(retParams)) {
				newParams = retParams
			} else if (isVector(replace)) {
				newParams = [..._unevaluatedParams]
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
				draggingIndex.value = [
					selectedIndex,
					handles.value[selectedIndex].findIndex(h => malEquals(h.id, newId)),
				]
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
			const unevaluated = _unevaluatedParams[i]

			newValue = reverseEval(newValue, unevaluated)
			newParams[i] = newValue
		}

		// Construct the new expression and send it to parent
		const newExp: MalSeq = fi.structType
			? (newParams[0] as MalSeq)
			: (L(exp[0], ...newParams) as MalSeq)

		// Copy the delimiter if possible
		copyDelimiters(newExp, exp)
		reconstructTree(newExp)

		// Finally replaces the sexp
		replaceExp(exp, newExp)
	}

	function onMouseup() {
		draggingIndex.value = null
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
		draggingIndex,
		handles,
		transformStyle,
		transform,
		selectedPath,
		onMousedown,
		handleCallbacks,
	}
}
