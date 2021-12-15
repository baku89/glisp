/*
{
  "id": "arc-strip",
  "label": "Arc Strip",
	"icon": "⌒",
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
		},
		{
			"name": "dotRadius",
			"type": "float",
			"default": 5
		}
	]
}
*/

// Inspired by Raven Kwok's study:
// https:/	witter.com/RavenKwok/status/1007881883059814407

let pt0, pt1, arc
let circle0, circle1, mouseCircle

function press() {
	mouseCircle = new Circle(mouse, dotRadius)
	mouseCircle.fillColor = GUIDE
}

function release() {
	pt0 = pt1
	pt1 = mouse

	if (pt0 && pt1) {
		arc = genArc()
	}

	if (circle0) {
		circle0.fillColor = strokeColor
	}

	circle0 = circle1
	circle1 = mouseCircle
}

function move() {
	if (arc) {
		arc.remove()
		arc = genArc()
	}
}

function drag(e) {
	move(e)

	mouseCircle.position = mouse
}

function end() {
	if (arc) arc.remove()

	if (circle0) circle0.fillColor = strokeColor
	if (circle1) circle1.fillColor = strokeColor

	pt0 = pt1 = arc = null
}

function genArc() {
	let item

	if (pt1.equals(pt0) || pt1.equals(mouse)) {
		item = new Line(pt0, mouse)
	} else {
		item = new Arc(pt0, pt1, mouse)
	}

	item.strokeColor = strokeColor
	item.strokeWidth = strokeWidth

	if (circle0) circle0.bringToFront()
	if (circle1) circle1.bringToFront()
	if (mouseCircle) mouseCircle.bringToFront()

	return item
}
