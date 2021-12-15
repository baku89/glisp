/*
{
  "id": "spray",
  "label": "Spray",
  "icon": "∵",
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
    },
    {
      "name": "minRadius",
      "type": "float",
      "default": 5
    },
    {
      "name": "maxRadius",
      "type": "float",
      "default": 20
    },
    {
      "name": "jitter",
      "type": "float",
      "default": 40
    }
  ]
}
*/

function drag() {
	const radius = mix(minRadius, maxRadius, random())
	const offset = new Point(
		mix(-jitter, jitter, random()),
		mix(-jitter, jitter, random())
	)

	const pt = mouse.add(offset)
	const t = random()

	let circle = new Circle(pt, radius)

	let colorA = Color(fillColor)
	let colorB = Color(fillColor2)

	circle.fillColor = colorA.mix(colorB, random()).string()
}

function mix(a, b, t) {
	return a + (b - a) * t
}
