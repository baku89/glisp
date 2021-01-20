const PresetRGBA = {
	colorSpace: `/** This JSON5 inserts GLSL struct to the shader:
struct Color {
	vec4 rgba;
}
*/
[
	{
		type: "vec4", // "vec4" | "vec3" | "vec2" | "float"
		name: "rgba", // string
		labels: ["Red", "Green", "Blue", "Alpha"] // string[]
	}
]`,
	viewerOptions: `/** This JSON5 generates GLSL snippets to the shader:
uniform float gridSize;
uniform vec3 gridColorA;
uniform vec3 gridColorB;
*/
[
	{
		type: "float", // "color" | "float"
		name: "gridSize", // string
		default: 12 // [number, number, number] | number
	},
	{
		type: "color",
		name: "gridColorA",
		default: [1, 1, 1]
	},
	{
		type: "color",
		name: "gridColorB",
		default: [0.8, 0.8, 0.8]
	}
]`,
	renderFunc: `/** Converts the color space struct to RGB color */
vec3 render(Color color) {
	vec3 rgb = color.rgba.rgb;
	float alpha = color.rgba.a;

	// Transparent checkerboard
	float tx = step(fract(gl_FragCoord.x / gridSize), .5);
	float ty = step(fract(gl_FragCoord.y / gridSize), .5);
	float t = mod(tx + ty, 2.0);
	vec3 checkerboard = mix(gridColorA, gridColorB, t);

	// Returns RGB
	return mix(checkerboard, rgb, alpha);
}`,
}

export {PresetRGBA}
