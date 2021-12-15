/*
{
  "id": "graph",
  "label": "Graph",
	"icon": "✣",
	"parameters": [
		{
			"name": "fillColor",
			"type": "color",
			"default": "#282a2e"
		},
		{
			"name": "strokeColor",
			"type": "color",
			"default": "#282a2e"
		},
		{
			"name": "strokeWidth",
			"type": "float",
			"default": 2
		},
		{
			"name": "dotRadius",
			"type": "float",
			"default": 3
		}
	]
}
*/

let points, lines

function begin() {
	points = []
}

function press() {
	circle = new Circle(mouse, dotRadius)
	circle.fillColor = fillColor
}

function release() {
	circle = null

	points.push(mouse)

	lines = points.map(pt => {
		const line = new Line(pt, mouse)
		line.strokeWidth = strokeWidth
		line.strokeColor = strokeColor

		return line
	})
}

function move() {
	if (circle) {
		circle.position = mouse
	}

	if (lines) {
		lines.forEach(line => {
			line.lastSegment.point = mouse
		})
	}
}

function drag(e) {
	move(e)
}

function end() {
	if (lines) {
		lines.forEach(line => line.remove())
	}

	points = lines = circle = null
}
