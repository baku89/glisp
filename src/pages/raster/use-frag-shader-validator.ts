import Regl from 'regl'
import {Ref, ref, watch} from 'vue'

import {MonacoEditorMarker} from '@/components/layouts/MonacoEditor'

function parseErrorLog(errLog: string | null) {
	if (!errLog) return []

	const result: {line: number; message: string}[] = []
	errLog.split('\n').forEach(function (errMsg) {
		if (errMsg.length < 5) {
			return
		}
		const parts = /^ERROR:\s+(\d+):(\d+):\s*(.*)$/.exec(errMsg)
		if (parts) {
			result.push({
				line: parseInt(parts[2]) || 0,
				message: parts[3].trim(),
			})
		} else if (errMsg.length > 0) {
			result.push({line: 0, message: errMsg})
		}
	})
	return result
}

export default function useFragShaderValidator(
	frag: Ref<string>,
	regl: Ref<Regl.Regl | null>
) {
	console.log(frag, regl, 'unco')
	const validFrag = ref(frag.value)

	const shaderErrors = ref<MonacoEditorMarker[]>([])

	console.log(frag.value)

	watch(
		[regl, frag],
		() => {
			if (!regl.value) return

			const gl = regl.value._gl

			const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
			if (!fragShader) return
			gl.shaderSource(fragShader, frag.value)
			gl.compileShader(fragShader)

			if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
				const errLog = gl.getShaderInfoLog(fragShader)
				shaderErrors.value = parseErrorLog(errLog)
			} else {
				// Succeed
				validFrag.value = frag.value
				shaderErrors.value = []
			}
		},
		{immediate: true}
	)

	return {validFrag, shaderErrors}
}
