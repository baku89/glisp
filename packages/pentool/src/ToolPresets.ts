import TemplateText from 'raw-loader!./tools-default/template.js'
import uid from 'uid'

import Tool from './Tool'

const presets = [
	// fs.readFileSync(__dirname + '/tools-default/pencil.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/rectangle.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/centered-circle.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/bezier.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/spray.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/graph.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/triangle-strip.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/arc-strip.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/radial-line.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/dubins-path.js', 'utf-8'),
	// fs.readFileSync(__dirname + '/tools-default/concentric-circles.js', 'utf-8'),
].map(Tool.parse)

const template = Tool.parse(TemplateText)

function createNew() {
	return {...template, id: uid(10)}
}

export {presets, createNew}
