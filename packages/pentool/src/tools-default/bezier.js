/*
{
  "id": "bezier",
  "label": "Bezier",
  "icon": "✑",
	"parameters": [
		{
			"name": "strokeColor",
			"type": "color",
			"default": "#282a2e"
		},
		{
			"name": "strokeWidth",
			"type": "float",
			"default": 2
		}
	]
}
*/

let path
let anchor, handleIn, handleOut, prevHandleOut, tangent, prevTangent
let anchorPt

function begin() {
	path = new Path()
	path.strokeColor = strokeColor
	path.strokeWidth = strokeWidth

	path.moveTo(mouse)
}

function press() {
	anchorPt = mouse

	if (tangent) {
		tangent.removeSegment(0)
	}
	if (prevTangent) prevTangent.remove()
	prevTangent = tangent

	if (handleIn) handleIn.remove()

	if (prevHandleOut) prevHandleOut.remove()
	prevHandleOut = handleOut

	tangent = new Path()
	tangent.moveTo(mouse)
	tangent.lineTo(mouse)
	tangent.lineTo(mouse)
	Guide.add(tangent)

	handleIn = Guide.addPoint(mouse, 'stroke')
	handleOut = Guide.addPoint(mouse, 'stroke')
	anchor = Guide.addPoint(mouse)
}

function release() {
	path.cubicCurveTo(mouse, mouse, mouse)
}

function move() {
	path.lastSegment.point = mouse
}

function drag({altKey}) {
	const d = mouse.subtract(anchorPt)

	path.lastSegment.handleOut = anchorPt
	handleOut.position = mouse
	tangent.lastSegment.point = mouse

	if (!altKey) {
		const handleInPt = anchorPt.subtract(d)

		path.lastSegment.handleIn.set(-d.x, -d.y)
		handleIn.position = handleInPt
		tangent.firstSegment.point = handleInPt
	}
}

function end() {
	path.removeSegment(path.segments.length - 1)
}
