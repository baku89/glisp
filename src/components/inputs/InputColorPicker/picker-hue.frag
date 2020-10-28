precision mediump float;

uniform vec2 u_resolution; 

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec3 color = hsv2rgb(vec3(uv.x, 1.0, 1.0));
	gl_FragColor = vec4(color, 1.0);
}