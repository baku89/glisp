import {DrawConfig} from 'regl'

export const REGL_QUAD_DEFAULT: DrawConfig = {
	vert: `
	precision mediump float;
	attribute vec2 position;
	varying vec2 uv;
	void main() {
		uv = position / 2.0 + 0.5;
		gl_Position = vec4(position, 0, 1);
	}`,
	attributes: {
		position: [-1, -1, 1, -1, -1, 1, 1, 1],
	},
	depth: {
		enable: false,
	},
	count: 4,
	primitive: 'triangle strip',
}
