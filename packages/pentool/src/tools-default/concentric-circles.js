/*
{
  "id": "9rfp2dve67",
  "label": "Concentric Circles",
  "icon": "◎",
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

let center, centerGuide, circleGuide

let radius, minAngle, maxAngle
let arc
let prevAngle
let turn

const PIH = PI / 2

function begin() {
	center = mouse

	centerGuide = Guide.addPoint(mouse)

	circleGuide = new Circle(mouse, 1)
	circleGuide.applyMatrix = false
	Guide.add(circleGuide)
}

function press({altKey}) {
	if (pressCount === 1) return

	minAngle = mouse.subtract(center).angle
	maxAngle = prevAngle = minAngle
	turn = 0
}

function release() {
	arc = null
	firstClick = false
}

function move({altKey}) {
	if (altKey) return

	radius = mouse.subtract(center).length
	circleGuide.scaling = radius
}

function drag() {
	if (pressCount === 1) {
		center = mouse
		centerGuide.position = mouse
		circleGuide.position = mouse
	} else {
		let angle = mouse.subtract(center).angle

		if (prevAngle > 90 && angle < -90) {
			turn += 1
		} else if (prevAngle < -90 && angle > 90) {
			turn -= 1
		}

		prevAngle = angle

		angle = angle + turn * 360

		minAngle = min(angle, minAngle)
		maxAngle = max(angle, maxAngle)

		if (arc) arc.remove()

		if (abs(maxAngle - minAngle) > 360) {
			arc = new Circle(center, radius)
		} else {
			const start = new Point(radius, 0).rotate(minAngle).add(center)
			const mid = new Point(radius, 0)
				.rotate((minAngle + maxAngle) / 2)
				.add(center)
			const end = new Point(radius, 0).rotate(maxAngle).add(center)

			arc = new Arc(start, mid, end)
		}

		arc.strokeColor = strokeColor
		arc.strokeWidth = strokeWidth
	}
}
