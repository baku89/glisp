/*
{
  "id": "",
	"label": "New Tool",
	"icon": "N",
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

function begin() {}

function press() {
	path = new Path()
	path.strokeWidth = strokeWidth
	path.strokeColor = strokeColor
	path.moveTo(mouse)
}

function drag() {
	path.lineTo(mouse)
}

function release() {}

function move() {}

function end() {}
