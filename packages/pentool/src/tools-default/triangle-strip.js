/*
{
  "id": "triangle-strip",
  "label": "Triangle Strip",
  "icon": "〼",
  "parameters": [
    {
      "name": "fillColor",
      "type": "color",
      "default": "#282a2e"
    },
    {
      "name": "fillColor2",
      "type": "color",
      "default": "#f9faf9"
    }
  ]
}
*/
let pt0, pt1, triangle
let guideEdge

function begin() {
	guideEdge = Guide.addLine(mouse, mouse, 3)
}

function release() {
	pt0 = pt1
	pt1 = mouse

	if (pt0 && pt1) {
		let colorA = Color(fillColor)
		let colorB = Color(fillColor2)

		triangle = new Path()
		triangle.fillColor = colorA.mix(colorB, random()).string()
		triangle.moveTo(pt0)
		triangle.lineTo(pt1)
		triangle.lineTo(mouse)

		guideEdge.firstSegment.point = pt0
		guideEdge.lastSegment.point = pt1
	}
}

function move() {
	if (guideEdge && !pt0 && pt1) {
		guideEdge.lastSegment.point = mouse
	}

	if (triangle) {
		triangle.lastSegment.point = mouse
	}
}

function drag(e) {
	move(e)
}

function end() {
	if (triangle) triangle.remove()

	pt0 = pt1 = triangle = null
}
