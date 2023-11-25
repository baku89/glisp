import {mat2d, vec2} from 'linearly'
import {computed, onBeforeMount, Ref, ref} from 'vue'

import {
	computeExpTransform,
	copyDelimiters,
	createList as L,
	equals,
	Expr,
	ExprColl,
	ExprMap,
	ExprSeq,
	getEvaluated,
	getFnInfo,
	getMapValue,
	isMap,
	isVector,
	replaceExpr,
	reverseEval,
} from '@/glisp'
import {getSVGPathData, getSVGPathDataRecursive} from '@/path-utils'
import {useSketchStore} from '@/stores/sketch'

interface ClassList {
	[name: string]: true
}

interface Handle {
	type: string
	cls: ClassList
	id: Expr
	guide: boolean
	transform: string
	yTransform?: string
	path?: string
}

const POINTABLE_HANDLE_TYPES = new Set(['translate', 'arrow', 'dia', 'point'])

export default function useHandle(
	selectedExp: Ref<ExprColl[]>,
	viewTransform: Ref<mat2d>,
	viewEl: Ref<HTMLElement | null>
) {
	const sketch = useSketchStore()

	const draggingIndex = ref<[number, number] | null>(null)
	const rawPrevPos = ref(vec2.zero)
	const fnInfo = computed(() => selectedExp.value.map(getFnInfo))

	const handleCallbacks = computed<(ExprMap | null)[]>(() =>
		fnInfo.value.map(fi => {
			if (!fi) {
				return null
			} else {
				const ret = getMapValue(fi.meta, 'handles')
				return isMap(ret) ? ret : null
			}
		})
	)

	const params = computed(() =>
		fnInfo.value.map((fnInfo, i) => {
			const e = selectedExp.value[i]
			if (isMap(e) || !fnInfo) {
				return []
			}
			return fnInfo.structType
				? [getEvaluated(e)]
				: e.slice(1).map(e => getEvaluated(e))
		})
	)

	const unevaluatedParams = computed(() =>
		fnInfo.value.map((fnInfo, i) => {
			const e = selectedExp.value[i]
			if (isMap(e) || !fnInfo) {
				return []
			}
			return fnInfo.structType ? [e] : e.slice(1)
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
		transform.value.map(xform => mat2d.invert(xform) ?? mat2d.ident)
	)
	const transformStyle = computed(() =>
		transform.value.map(xform => `matrix(${xform.join(',')})`).join(' ')
	)

	const selectedPath = computed(() =>
		returnedValue.value.map(getSVGPathDataRecursive)
	)

	const handles = computed(() =>
		handleCallbacks.value.map((cb, index) => {
			if (!cb) return []

			const drawHandle = cb['draw']

			if (typeof drawHandle !== 'function') {
				return []
			}

			const options = {
				['params']: params.value[index],
				['return']: returnedValue.value[index],
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
				const type = h['type'] as string
				const guide = !!h['guide']
				const classList = ((h['class'] as string) || '')
					.split(' ')
					.filter(c => !!c)
				const cls = {} as ClassList
				for (const name of classList) {
					cls[name] = true
				}

				let xform = transform.value[index]
				let yRotate = 0

				if (POINTABLE_HANDLE_TYPES.has(type)) {
					const [x, y] = h['pos']
					xform = mat2d.translate(xform, [x, y])
				}

				if (type === 'arrow') {
					const angle = h['angle'] || 0
					xform = mat2d.rotate(xform, angle)
				} else if (type === 'dia') {
					xform = [1, 0, 0, 1, xform[4], xform[5]]
				}

				if (type !== 'path') {
					// Normalize axis X
					const xAxis: vec2 = vec2.normalize([xform[0], xform[1]])

					// Force axisY to be perpendicular to axisX
					const yAxis = vec2.rotate(xAxis, Math.PI / 2)

					// set Y rotation
					if (type === 'translate') {
						const origAxisY: vec2 = [xform[2], xform[3]]
						const perpAxisYAngle = vec2.angle(yAxis)
						yRotate = vec2.angle(vec2.rotate(origAxisY, -perpAxisYAngle))
					}

					xform = [...xAxis, ...yAxis, xform[4], xform[5]]
				}

				const ret: Handle = {
					type,
					cls,
					guide,
					id: h['id'],
					transform: `matrix(${xform.join(',')})`,
				}

				if (type === 'translate') {
					ret.yTransform = `rotate(${(yRotate * 180) / Math.PI})`
				} else if (type === 'path') {
					ret.path = getSVGPathData(h['path'])
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
		if (draggingIndex.value === null || !viewEl.value) {
			return
		}

		const [selectedIndex, handleIndex] = draggingIndex.value
		const callbacks = handleCallbacks.value[selectedIndex]

		if (!callbacks) {
			return
		}

		const dragHandle = callbacks['drag']

		if (typeof dragHandle !== 'function') {
			return
		}

		const viewRect = viewEl.value.getBoundingClientRect()
		const rawPos: vec2 = [e.clientX - viewRect.left, e.clientY - viewRect.top]

		const xformInv = transformInv.value[selectedIndex]
		const _fnInfo = fnInfo.value[selectedIndex]
		const _exp = selectedExp.value[selectedIndex]
		const _params = params.value[selectedIndex]
		const _unevaluatedParams = unevaluatedParams.value[selectedIndex]

		if (!_fnInfo || isMap(_exp)) {
			return
		}

		const pos = vec2.transformMat2d(rawPos, xformInv)

		const prevPos = vec2.transformMat2d(rawPrevPos.value, xformInv)

		const handle = handles.value[selectedIndex][handleIndex]

		const eventInfo = {
			id: handle.id === undefined ? null : handle.id,
			pos: pos,
			'prev-pos': prevPos,
			params: _params,
		} as ExprMap

		rawPrevPos.value = rawPos

		let result: Expr
		try {
			result = dragHandle(eventInfo)
		} catch (err) {
			return null
		}

		if (!isVector(result) && !isMap(result)) {
			return null
		}

		// Parse the result
		let newParams: Expr[]
		let updatedIndices: number[] | undefined = undefined

		if (isMap(result)) {
			const retParams = result['params']
			const replace = result['replace']
			const changeId = result['change-id']

			if (isVector(retParams)) {
				newParams = retParams
			} else if (isVector(replace)) {
				newParams = [..._unevaluatedParams]
				const pairs = (
					typeof replace[0] === 'number'
						? [replace as any as [number, Expr]]
						: (replace as any as [number, Expr][])
				).map(
					([si, e]) =>
						[si < 0 ? newParams.length + si : si, e] as [number, Expr]
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
					handles.value[selectedIndex].findIndex(h => equals(h.id, newId)),
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

			// if (malEquals(newValue, this.params[i])) {
			// 	newValue = unevaluated
			// }

			newValue = reverseEval(newValue, unevaluated)
			newParams[i] = newValue
		}

		// Construct the new expression and send it to parent
		const newExp: ExprSeq = _fnInfo.structType
			? (newParams[0] as ExprSeq)
			: (L(_exp[0], ...newParams) as ExprSeq)

		// Copy the delimiter if possible
		copyDelimiters(newExp, _exp)

		// Finally replaces the sexp
		replaceExpr(_exp, newExp)
	}

	function onMouseup() {
		draggingIndex.value = null
		unregisterMouseEvents()
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
		transform,
		selectedPath,
		handleCallbacks,
		transformStyle,
		onMousedown,
	}
}
