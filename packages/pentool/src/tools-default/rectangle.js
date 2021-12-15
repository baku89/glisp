/*
{
  "id": "rectangle",
  "label": "Rectangle",
  "icon": "■",
  "parameters": [
    {
      "name": "fillColor",
      "type": "color",
      "default": "#282a2e"
    }
  ]
}
*/

let from, rect

function press() {
	from = mouse
}

function drag() {
	if (rect) rect.remove()
	rect = new Rectangle(from, mouse)
	rect.fillColor = fillColor
}

function release() {
	rect = null
}
