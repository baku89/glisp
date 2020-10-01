import {
	copyDelimiters,
	reverseEval,
	getFnInfo,
	computeExpTransform,
	getMapValue,
	replaceExp,, jsToMal
} from '@/mal/utils'
import {
	MalSeq,
	MalMap,
	MalVal,
	MalVector,
	MalColl,
	MalNil,
	MalList,
} from '@/mal/types'
import {computed, Ref, onBeforeMount, SetupContext, ref} from 'vue'
// import {getSVGPathData, getSVGPathDataRecursive} from '@/path-utils'
import {vec2, mat2d} from 'gl-matrix'

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

const POINTABLE_HANDLE_TYPES = new Set(['translate', 'arrow', 'dia', 'point'])

export default function useHandle(
	selectedExp: Ref<MalColl[]>,
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
				return MalMap.is(ret) ? ret : undefined
			}
		})
	)
	const params = computed(() =>
		fnInfo.value.map((fi, i) => {
			const e = selectedExp.value[i]
			if (MalMap.is(e) || !fi) {
				return []
			}
			return fi.structType ? [e.evaluated] : e.slice(1).map(e => e.evaluated)
		})
	)
	const unevaluatedParams = computed(() =>
		fnInfo.value.map((fi, i) => {
			const e = selectedExp.value[i]
			if (MalMap.is(e) || !fi) {
				return []
			}
			return fi.structType ? [e] : e.slice(1)
		})
	)
	const returnedValue = computed(() => selectedExp.value.map(e => e.evaluated))
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

			const drawHandle = cb.draw

			if (typeof drawHandle !== 'function') {
				return []
			}

			const options = {
				params: params.value[index],
				return: returnedValue.value[index],
			}

			let handles
			try {
				handles = drawHandle(options)
			} catch (err) {
				console.error('ViewHandles draw', err)
				return []
			}

			if (!MalVector.is(handles)) {
				return []
			}

			return handles.value.map(h => {
				if (!MalMap.is(h)) {
					throw new Error('invalid handle')
				}

				const info = h.value

				const type = info.type.value as string
				const guide = !!info.guide.value

				const cls = Object.fromEntries(
					((info.class.value as string) || '')
						.split(' ')
						.filter(c => !!c)
						.map(c => [c, true] as [string, true])
				)

				const xform = mat2d.clone(transform.value[index])
				let yRotate = 0

				if (POINTABLE_HANDLE_TYPES.has(type)) {
					const [x, y] = info.pos.value
					mat2d.translate(xform, xform, [x, y])
				}

				if (type === 'arrow') {
					const angle = info.angle.value || 0
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

		const dragHandle = cbs.drag

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

		if (!fi || MalMap.is(exp)) {
			return
		}

		const pos = [0, 0]
		vec2.transformMat2d(pos as vec2, rawPos as vec2, xformInv)

		const prevPos = [0, 0]
		vec2.transformMat2d(prevPos as vec2, rawPrevPos.value as vec2, xformInv)

		const handle = handles.value[selectedIndex][handleIndex]

		const eventInfo = MalMap.create({
			id: handle.id === undefined ? MalNil.create() : handle.id,
			pos: jsToMal(pos),
			'prev-pos': jsToMal(prevPos),
			params: _params,
		})

		rawPrevPos.value = rawPos

		let result: MalVal
		try {
			result = dragHandle(eventInfo)
		} catch (err) {
			console.error('ViewHandles onDrag', err)
			return null
		}

		if (!MalVector.is(result) && !MalMap.is(result)) {
			return null
		}

		// Parse the result
		let newParams: MalVal[]
		let updatedIndices: number[] | undefined = undefined

		if (MalMap.is(result)) {
			const retParams = result.value.params
			const replace = result.value.replace
			const changeId = result.value['change-id']

			if (MalVector.is(retParams)) {
				newParams = retParams
			} else if (MalVector.is(replace)) {
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

			if (MalVector.is(changeId)) {
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
			: (MalList.create(exp.value[0], ...newParams) as MalSeq)

		// Copy the delimiter if possible
		copyDelimiters(newExp, exp)

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
