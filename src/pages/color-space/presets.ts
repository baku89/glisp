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
	vec2 t2 = step(.5, fract(gl_FragCoord.xy / gridSize));
	float t = mod(t2.x + t2.y, 2.0);
	vec3 checkerboard = mix(gridColorA, gridColorB, t);

	// Returns RGB
	return mix(checkerboard, rgb, alpha);
}`,
}

const PresetCMYK = {
	colorSpace: `[
	{
		type: "vec3",
		name: "cmy",
		labels: ["Cyan", "Magenda", "Yellow"]
	},
	{
		type: "float",
		name: "black",
		labels: ["Black"]
	}
]`,
	viewerOptions: `[
	{
		type: "color",
		name: "paperColor",
		default: [1.0, 1.0, 1.0]
	}
]`,
	renderFunc: `vec3 render(Color color) {
	return paperColor * mix(1.0 - color.cmy, vec3(0.0), color.black);
}`,
}

const PresetPinkSilver = {
	colorSpace: `[
	{
		type: "vec3",
		name: "spot",
		labels: ["Black", "Pink", "Silver"]
	},
]`,
	viewerOptions: '[]',
	renderFunc: `#define PINK vec3(1.0, 0.0, 0.8)
#define BLACK vec3(0.0)	
#define SILVER vec3(.8)
#define FLAKE_LOW vec3(.85)
#define FLAKE_HIGH vec3(.95)

float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p){
	vec2 ip = floor(p);
	vec2 u = fract(p);
	u = u*u*(3.0-2.0*u);
	float res = mix(
		mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
		mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
	return res*res;
}

vec3 render(Color color) {
	float black = color.spot.x;
	float pink = color.spot.y;
	float silver = color.spot.z;

	vec3 rgb = vec3(1.0);
	rgb = mix(rgb, rgb * PINK, pink);

	rgb = mix(rgb, rgb * BLACK, mix(black, black * 0.75, pink));

	vec2 samplePos = gl_FragCoord.xy * 2.0;
	float rnd = noise(samplePos);
	float rnd2 = noise(samplePos + rnd * 100.0);

	rgb = mix(rgb, SILVER, silver);

	vec3 flake = mix(FLAKE_LOW, FLAKE_HIGH, rnd2);
	rgb = mix(rgb, flake, step(mix(1.0, 0.3, silver), rnd) * mix(.4, 1.0, silver));

	return rgb;
}`,
}

const PresetUV = {
	colorSpace: `[
	{
		type: "vec2",
		name: "uv",
		labels: ["U", "V"]
	},
]`,
	viewerOptions: `[]`,
	renderFunc: `vec3 render(Color color) {
	return vec3(color.uv, 0.0);
}`,
}

const PresetVectorField = {
	colorSpace: `[
	{
		type: "vec2",
		name: "dir",
		labels: ["Axis X", "Axis Y"]
	},
]`,
	viewerOptions: `[]`,
	renderFunc: `#define SLOW vec3(0.0, 0.0, 1.0)
#define FAST vec3(1.0, 0.0, 0.0)
vec3 render(Color color) {
	vec2 dir = color.dir * 2.0 - 1.0;

	vec2 uv = fract(gl_FragCoord.xy / 18.0) * 2.0 - 1.0;

	// scale UV
	float l = length(dir) / sqrt(2.0);

	// rotate UV
	float angle = -atan(dir.y, dir.x);
	float c = cos(angle);
	float s = sin(angle);
	mat2 rotate = mat2(c, -s, s, c);

	uv *= rotate;

	// line
	float t = 1.0;
	t *= step(-0.15, uv.y) * step(uv.y, 0.15);

	return t * mix(.7, 1.0, uv.x) * mix(SLOW, FAST, l);
}`,
}

export default {
	RGBA: PresetRGBA,
	CMYK: PresetCMYK,
	'Pink + Silver': PresetPinkSilver,
	UV: PresetUV,
	'Vector Field': PresetVectorField,
}
