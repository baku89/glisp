precision mediump float;

varying vec2 uv;

uniform vec3 hsv;
uniform float mode;
#define MODE_H 0.0
#define MODE_S 1.0
#define MODE_V 2.0
uniform float offset;

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
	float t = uv.x + offset;

	vec3 color;
	
	if (mode == MODE_H) {
		color = hsv2rgb(vec3(t, 1.0, 1.0));
	} else if (mode == MODE_S) {
		color = hsv2rgb(vec3(hsv.x, t, hsv.z));
	} else if (mode == MODE_V) {
		color = hsv2rgb(vec3(hsv.x, hsv.y, t));
	}
		
	gl_FragColor = vec4(color, 1.0);
}