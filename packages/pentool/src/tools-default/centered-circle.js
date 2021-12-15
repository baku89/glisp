/*
{
  "id": "centered-circle",
  "label": "Centered Circle",
	"icon": "●",
	"parameters": [
		{
			"name": "fillColor",
			"type": "color",
			"default": "#292a2e"
		}
	]
}
*/

let circle, center

function press() {
	center = mouse
}

function drag() {
	const d = mouse.subtract(center)
	const r = d.length

	if (circle) circle.remove()
	circle = new Path.Circle(center, r)
	circle.fillColor = fillColor
}

function release() {
	circle = null
}
