precision mediump float;

uniform vec2 u_resolution; 
uniform vec3 hsv;

uniform float modeX;
uniform float modeY;
#define MODE_H 0.0
#define MODE_S 1.0
#define MODE_V 2.0

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;

	vec3 _hsv = vec3(hsv);

	if (modeX == MODE_H) {
		_hsv.x = uv.x;
		if (modeY == MODE_S) {
			_hsv.z = 1.0;
		} else if (modeY == MODE_V) {
			_hsv.y = 1.0;
		}
	} else if (modeX == MODE_S) {
		_hsv.y = uv.x;
	} else if (modeX == MODE_V) {
		_hsv.z = uv.x;
	}

	if (modeY == MODE_H) {
		_hsv.x = uv.y;
		if (modeX == MODE_S) {
			_hsv.z = 1.0;
		} else if (modeX == MODE_V) {
			_hsv.y = 1.0;
		}
	} else if (modeY == MODE_S) {
		_hsv.y = uv.y;
	} else if (modeY == MODE_V) {
		_hsv.z = uv.y;
	}

	vec3 color = hsv2rgb(_hsv);

	gl_FragColor = vec4(color, 1.0);
}