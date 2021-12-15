/*
{
  "id": "pencil",
  "label": "Pencil",
	"icon": "✎",
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

function press() {
	path = new Path()
	path.strokeWidth = strokeWidth
	path.strokeColor = strokeColor
	path.moveTo(mouse)
}

function drag() {
	path.lineTo(mouse)
}
