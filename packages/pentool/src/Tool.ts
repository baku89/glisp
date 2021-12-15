import EventEmitter from 'eventemitter3'
import linesIntersection from 'lines-intersection'
import Mousetrap from 'mousetrap'
import paper from 'paper'

import {jsonStringify} from './util/JsonStringify'

type GuideMode = 'stroke' | 'fill'

export type Parameters = Record<string, number | string>

const evaluate = (window as any).evaluate

export interface ParamScheme {
	type: 'float' | 'color'
	name: string
	label: string
	default: string | number
}

export interface ToolInfo {
	meta: {
		id: string
		label: string
		icon: string
		parameters: ParamScheme[]
	}
	code: string
}

export default class Tool extends EventEmitter {
	isDrawing = false
	isDragging = false
	isPressing = false

	code = ''
	el!: HTMLCanvasElement
	globalVariables!: Record<string, any>
	info!: ToolInfo

	constructor(
		info: ToolInfo,
		public project: paper.Project,
		public parameters: Parameters
	) {
		super()

		this.info = info

		this.el = project.view.element

		this.globalVariables = {...globalVariables}

		const codeToCompile = createEvalChunk(this.code)

		;(window as any).sandbox = sandbox
		;(window as any).globalVariables = this.globalVariables
		;(window as any).parameters = parameters

		const events: Record<string, any> = evaluate(codeToCompile)

		for (const [name, cb] of Object.entries(events)) {
			this.on(name, cb)
		}
	}

	pause() {
		this.el.removeEventListener('mousedown', this.#onMousedown)
		window.removeEventListener('mousemove', this.#onMousemove)
		window.removeEventListener('mousewheel', this.#onMousemove)
		window.removeEventListener('mouseup', this.#onMouseup)
	}

	resume() {
		this.el.addEventListener('mousedown', this.#onMousedown)
		window.addEventListener('mousemove', this.#onMousemove)
		window.addEventListener('mousewheel', this.#onMousemove)
		window.addEventListener('mouseup', this.#onMouseup)
	}

	deactivate() {
		if (this.isDrawing) {
			this.end()
		}
		this.pause()
	}

	activate() {
		this.resume()
	}

	end() {
		const guideLayer = paper.project.layers.find(l => l.name === 'guide')
		if (!guideLayer) throw new Error('No guide layer')

		this.isDrawing = false
		this.isDragging = false
		this.isPressing = false

		guideLayer.removeChildren()
		guideLayer.bringToFront()

		// end
		Mousetrap.unbind(['enter', 'esc'])
		this.emit('end')
	}

	exportText() {
		const info = jsonStringify(this.info)
		const text = `/*\n${info}\n*/\n\n${this.code}`
		return text
	}

	#onMousedown = (_e: MouseEvent) => {
		const e = this.#transformMouseEvent(_e)

		this.isDragging = true
		this.isPressing = true

		if (!this.isDrawing) {
			// begin
			Mousetrap.bind(['enter', 'esc'], this.end.bind(this))
			this.isDrawing = true
			this.globalVariables.pressCount = 0

			this.emit('begin', e)
		}

		this.globalVariables.pressCount += 1
		this.emit('press', e)
	}

	#onMousemove = (_e: any) => {
		const e = this.#transformMouseEvent(_e)

		if (this.isDrawing && this.isDragging) {
			this.emit('drag', e)
		} else {
			this.emit('move', e)
		}
	}

	#onMouseup = (_e: MouseEvent) => {
		if (!this.isPressing) {
			return
		}

		this.isDragging = false
		this.isPressing = false

		if (this.isDrawing) {
			const e = this.#transformMouseEvent(_e)
			this.emit('release', e)
		}
	}

	#transformMouseEvent = (e: MouseEvent) => {
		const pos = new paper.Point(e.x, e.y)
		const mouse = this.project.view.viewToProject(pos)

		this.globalVariables.mouse = mouse
		this.globalVariables.mouseX = mouse.x
		this.globalVariables.mouseY = mouse.y

		const {x, y} = mouse
		const {altKey, shiftKey} = e

		return {altKey, shiftKey, x, y}
	}

	static compile(tool: ToolInfo, parameters: Parameters) {
		return new Tool(tool, paper.project, parameters)
	}

	static parse(text: string): ToolInfo {
		const result = text.match(/\/\*([\s\S]*?)\*\/[\n]*([\s\S]*)/m)
		if (!result) throw new Error('Cannot parse tool info')

		const code = result[2]
		const metaJson = result[1]

		let meta: ToolInfo['meta']
		try {
			meta = JSON.parse(metaJson)
		} catch (err) {
			throw new Error('Invalid metadata: ' + metaJson)
		}

		meta.parameters = meta.parameters || []

		return {meta, code}
	}
}

const globalVariables: Record<string, any> = {
	mouse: new paper.Point(0, 0),
	mouseX: 0,
	mouseY: 0,
	pressCount: 0,
	GUIDE: '#3e999f',
}

const sandbox: Record<string, any> = {
	// paper
	Point: paper.Point,
	Group: paper.Group,
	Path: paper.Path,
	Matrix: paper.Matrix,

	Line: paper.Path.Line,
	Circle: paper.Path.Circle,
	Rectangle: paper.Path.Rectangle,
	Ellipse: paper.Path.Ellipse,
	Arc: paper.Path.Arc,
	RegularPolygon: paper.Path.RegularPolygon,
	Star: paper.Path.Star,

	Color: paper.Color,

	Guide: {
		add(item: paper.Item, mode: GuideMode = 'stroke') {
			const guideLayer = paper.project.layers.find(l => l.name === 'guide')
			if (!guideLayer) throw new Error('No guide layer')

			item.addTo(guideLayer)

			if (mode === 'stroke') {
				item.strokeColor = new paper.Color('#3e999f')
				item.strokeWidth = 0.5
				item.fillColor = null
				item.strokeScaling = false
			} else {
				item.fillColor = new paper.Color('#3e999f')
				item.strokeWidth = 0
			}

			return item
		},

		addPoint(center: paper.Point, mode: GuideMode = 'fill') {
			const guideLayer = paper.project.layers.find(l => l.name === 'guide')
			if (!guideLayer) throw new Error('No guide layer')

			const item = new paper.Path.Circle(center, 3)
			item.applyMatrix = false

			const s = 1 / paper.project.view.scaling.x
			item.scaling = new paper.Point(s, s)
			item.addTo(guideLayer)

			if (mode === 'stroke') {
				item.strokeColor = new paper.Color('#3e999f')
				item.strokeWidth = 0.5
				item.strokeScaling = false
				item.fillColor = new paper.Color('white')
			} else {
				item.fillColor = new paper.Color('#3e999f')
				item.strokeWidth = 0
			}
			item.data.isMarker = true

			return item
		},

		addLine(from: paper.Point, to: paper.Point, width = 0.5) {
			const guideLayer = paper.project.layers.find(l => l.name === 'guide')
			if (!guideLayer) throw new Error('No guide layer')

			const item = new paper.Path.Line(from, to)
			item.addTo(guideLayer)
			item.strokeColor = new paper.Color('#3e999f')
			item.strokeWidth = 0.5
			item.strokeScaling = false
			item.data.originalStrokeWidth = width

			return item
		},
	},

	getIntersection(
		p0: paper.Point,
		p1: paper.Point,
		p2: paper.Point,
		p3: paper.Point
	) {
		const result = linesIntersection(
			p0.x,
			p0.y,
			p1.x,
			p1.y,
			p2.x,
			p2.y,
			p3.x,
			p3.y
		)
		return result ? new paper.Point(result[0], result[1]) : null
	},

	console: console,

	// Math
	degrees: (rad: number) => (rad * 180) / Math.PI,
	radians: (deg: number) => (deg * Math.PI) / 180,
	PI_2: Math.PI * 2,
}

for (const name of Object.getOwnPropertyNames(Math)) {
	sandbox[name] = (Math as any)[name]
}

function createEvalChunk(code: string) {
	return `try {
	with (window.globalVariables) {
		with (window.parameters) {
			${code}
		}
	}
} catch (err) {
	console.error(err)
}

let events = {}

try {
	if (begin) events.begin = begin
} catch (err) {}

try {
	if (end) events.end = end
} catch (err) {}

try {
	if (press) events.press = press
} catch (err) {}

try {
	if (release) events.release = release
} catch (err) {}

try {
	if (move) events.move = move
} catch (err) {}

try {
	if (drag) events.drag = drag
} catch (err) {}

events`
}
