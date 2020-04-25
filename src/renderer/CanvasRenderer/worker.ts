import CanvasRenderer from './CanvasRenderer'

let renderer: CanvasRenderer

const _self = (self as unknown) as Worker

onmessage = async e => {
	const {type, params} = e.data

	if (!renderer) {
		renderer = new CanvasRenderer()
	}

	try {
		const ret = await renderer.postMeessage(type, params)
		_self.postMessage({type, params: ret})
	} catch (err) {
		_self.postMessage({type, params: err})
	}
}
