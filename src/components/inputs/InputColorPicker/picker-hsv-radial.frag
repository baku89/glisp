precision mediump float;

uniform vec2 u_resolution; 
uniform vec3 hsv;

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

#define PI 3.1415926535897

float atan2(in float y, in float x){
	return x == 0.0 ? sign(y) * PI / 2.0 : atan(y, x);
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec2 pos = (1.0 - uv) * 2.0 - 1.0;

	float h = (atan2(pos.y, pos.x) / PI + 1.0) / 2.0;
	float s = length(pos);
	float v = 1.0;

	vec3 color = hsv2rgb(vec3(h, s, v));

	gl_FragColor = vec4(color, 1.0);
}