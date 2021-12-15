/*
{
  "id": "radial-line",
  "label": "Radial Line",
	"icon": "✳",
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

let center, centerGuide, dirGuide

let dir, mindist, maxdist
let line

function begin() {
	center = mouse

	centerGuide = Guide.addPoint(mouse)
	dirGuide = Guide.addLine(mouse, mouse)
}

function press({altKey}) {
	if (pressCount == 1) return

	line = new Line(mouse, mouse)
	line.strokeColor = strokeColor
	line.strokeWidth = strokeWidth

	mindist = center.getDistance(mouse)
	maxdist = mindist
}

function release() {
	if (line && mindist == maxdist) {
		line.remove()
	}

	firstClick = false
}

function move({altKey}) {
	if (altKey) return

	dir = mouse.subtract(center).normalize()

	dirGuide.firstSegment.point = dir.multiply(-10000000).add(center)
	dirGuide.lastSegment.point = dir.multiply(10000000).add(center)
}

function drag() {
	if (pressCount == 1) {
		center = mouse
		centerGuide.position = mouse
	} else {
		const dist = dir.dot(mouse.subtract(center))

		mindist = min(dist, mindist)
		maxdist = max(dist, maxdist)

		line.firstSegment.point = center.add(dir.multiply(mindist))
		line.lastSegment.point = center.add(dir.multiply(maxdist))
	}
}
