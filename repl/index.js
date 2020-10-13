(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else {
		var a = factory();
		for(var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
	}
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/repl.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./node_modules/ansi-styles/index.js":
/*!*******************************************!*\
  !*** ./node_modules/ansi-styles/index.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(module) {

const wrapAnsi16 = (fn, offset) => (...args) => {
	const code = fn(...args);
	return `\u001B[${code + offset}m`;
};

const wrapAnsi256 = (fn, offset) => (...args) => {
	const code = fn(...args);
	return `\u001B[${38 + offset};5;${code}m`;
};

const wrapAnsi16m = (fn, offset) => (...args) => {
	const rgb = fn(...args);
	return `\u001B[${38 + offset};2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
};

const ansi2ansi = n => n;
const rgb2rgb = (r, g, b) => [r, g, b];

const setLazyProperty = (object, property, get) => {
	Object.defineProperty(object, property, {
		get: () => {
			const value = get();

			Object.defineProperty(object, property, {
				value,
				enumerable: true,
				configurable: true
			});

			return value;
		},
		enumerable: true,
		configurable: true
	});
};

/** @type {typeof import('color-convert')} */
let colorConvert;
const makeDynamicStyles = (wrap, targetSpace, identity, isBackground) => {
	if (colorConvert === undefined) {
		colorConvert = __webpack_require__(/*! color-convert */ "./node_modules/ansi-styles/node_modules/color-convert/index.js");
	}

	const offset = isBackground ? 10 : 0;
	const styles = {};

	for (const [sourceSpace, suite] of Object.entries(colorConvert)) {
		const name = sourceSpace === 'ansi16' ? 'ansi' : sourceSpace;
		if (sourceSpace === targetSpace) {
			styles[name] = wrap(identity, offset);
		} else if (typeof suite === 'object') {
			styles[name] = wrap(suite[targetSpace], offset);
		}
	}

	return styles;
};

function assembleStyles() {
	const codes = new Map();
	const styles = {
		modifier: {
			reset: [0, 0],
			// 21 isn't widely supported and 22 does the same thing
			bold: [1, 22],
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29]
		},
		color: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],

			// Bright color
			blackBright: [90, 39],
			redBright: [91, 39],
			greenBright: [92, 39],
			yellowBright: [93, 39],
			blueBright: [94, 39],
			magentaBright: [95, 39],
			cyanBright: [96, 39],
			whiteBright: [97, 39]
		},
		bgColor: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49],

			// Bright color
			bgBlackBright: [100, 49],
			bgRedBright: [101, 49],
			bgGreenBright: [102, 49],
			bgYellowBright: [103, 49],
			bgBlueBright: [104, 49],
			bgMagentaBright: [105, 49],
			bgCyanBright: [106, 49],
			bgWhiteBright: [107, 49]
		}
	};

	// Alias bright black as gray (and grey)
	styles.color.gray = styles.color.blackBright;
	styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
	styles.color.grey = styles.color.blackBright;
	styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;

	for (const [groupName, group] of Object.entries(styles)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`
			};

			group[styleName] = styles[styleName];

			codes.set(style[0], style[1]);
		}

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false
		});
	}

	Object.defineProperty(styles, 'codes', {
		value: codes,
		enumerable: false
	});

	styles.color.close = '\u001B[39m';
	styles.bgColor.close = '\u001B[49m';

	setLazyProperty(styles.color, 'ansi', () => makeDynamicStyles(wrapAnsi16, 'ansi16', ansi2ansi, false));
	setLazyProperty(styles.color, 'ansi256', () => makeDynamicStyles(wrapAnsi256, 'ansi256', ansi2ansi, false));
	setLazyProperty(styles.color, 'ansi16m', () => makeDynamicStyles(wrapAnsi16m, 'rgb', rgb2rgb, false));
	setLazyProperty(styles.bgColor, 'ansi', () => makeDynamicStyles(wrapAnsi16, 'ansi16', ansi2ansi, true));
	setLazyProperty(styles.bgColor, 'ansi256', () => makeDynamicStyles(wrapAnsi256, 'ansi256', ansi2ansi, true));
	setLazyProperty(styles.bgColor, 'ansi16m', () => makeDynamicStyles(wrapAnsi16m, 'rgb', rgb2rgb, true));

	return styles;
}

// Make the export immutable
Object.defineProperty(module, 'exports', {
	enumerable: true,
	get: assembleStyles
});

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../webpack/buildin/module.js */ "./node_modules/webpack/buildin/module.js")(module)))

/***/ }),

/***/ "./node_modules/ansi-styles/node_modules/color-convert/conversions.js":
/*!****************************************************************************!*\
  !*** ./node_modules/ansi-styles/node_modules/color-convert/conversions.js ***!
  \****************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

/* MIT license */
/* eslint-disable no-mixed-operators */
const cssKeywords = __webpack_require__(/*! color-name */ "./node_modules/color-name/index.js");

// NOTE: conversions should only return primitive values (i.e. arrays, or
//       values that give correct `typeof` results).
//       do not use box values types (i.e. Number(), String(), etc.)

const reverseKeywords = {};
for (const key of Object.keys(cssKeywords)) {
	reverseKeywords[cssKeywords[key]] = key;
}

const convert = {
	rgb: {channels: 3, labels: 'rgb'},
	hsl: {channels: 3, labels: 'hsl'},
	hsv: {channels: 3, labels: 'hsv'},
	hwb: {channels: 3, labels: 'hwb'},
	cmyk: {channels: 4, labels: 'cmyk'},
	xyz: {channels: 3, labels: 'xyz'},
	lab: {channels: 3, labels: 'lab'},
	lch: {channels: 3, labels: 'lch'},
	hex: {channels: 1, labels: ['hex']},
	keyword: {channels: 1, labels: ['keyword']},
	ansi16: {channels: 1, labels: ['ansi16']},
	ansi256: {channels: 1, labels: ['ansi256']},
	hcg: {channels: 3, labels: ['h', 'c', 'g']},
	apple: {channels: 3, labels: ['r16', 'g16', 'b16']},
	gray: {channels: 1, labels: ['gray']}
};

module.exports = convert;

// Hide .channels and .labels properties
for (const model of Object.keys(convert)) {
	if (!('channels' in convert[model])) {
		throw new Error('missing channels property: ' + model);
	}

	if (!('labels' in convert[model])) {
		throw new Error('missing channel labels property: ' + model);
	}

	if (convert[model].labels.length !== convert[model].channels) {
		throw new Error('channel and label counts mismatch: ' + model);
	}

	const {channels, labels} = convert[model];
	delete convert[model].channels;
	delete convert[model].labels;
	Object.defineProperty(convert[model], 'channels', {value: channels});
	Object.defineProperty(convert[model], 'labels', {value: labels});
}

convert.rgb.hsl = function (rgb) {
	const r = rgb[0] / 255;
	const g = rgb[1] / 255;
	const b = rgb[2] / 255;
	const min = Math.min(r, g, b);
	const max = Math.max(r, g, b);
	const delta = max - min;
	let h;
	let s;

	if (max === min) {
		h = 0;
	} else if (r === max) {
		h = (g - b) / delta;
	} else if (g === max) {
		h = 2 + (b - r) / delta;
	} else if (b === max) {
		h = 4 + (r - g) / delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	const l = (min + max) / 2;

	if (max === min) {
		s = 0;
	} else if (l <= 0.5) {
		s = delta / (max + min);
	} else {
		s = delta / (2 - max - min);
	}

	return [h, s * 100, l * 100];
};

convert.rgb.hsv = function (rgb) {
	let rdif;
	let gdif;
	let bdif;
	let h;
	let s;

	const r = rgb[0] / 255;
	const g = rgb[1] / 255;
	const b = rgb[2] / 255;
	const v = Math.max(r, g, b);
	const diff = v - Math.min(r, g, b);
	const diffc = function (c) {
		return (v - c) / 6 / diff + 1 / 2;
	};

	if (diff === 0) {
		h = 0;
		s = 0;
	} else {
		s = diff / v;
		rdif = diffc(r);
		gdif = diffc(g);
		bdif = diffc(b);

		if (r === v) {
			h = bdif - gdif;
		} else if (g === v) {
			h = (1 / 3) + rdif - bdif;
		} else if (b === v) {
			h = (2 / 3) + gdif - rdif;
		}

		if (h < 0) {
			h += 1;
		} else if (h > 1) {
			h -= 1;
		}
	}

	return [
		h * 360,
		s * 100,
		v * 100
	];
};

convert.rgb.hwb = function (rgb) {
	const r = rgb[0];
	const g = rgb[1];
	let b = rgb[2];
	const h = convert.rgb.hsl(rgb)[0];
	const w = 1 / 255 * Math.min(r, Math.min(g, b));

	b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));

	return [h, w * 100, b * 100];
};

convert.rgb.cmyk = function (rgb) {
	const r = rgb[0] / 255;
	const g = rgb[1] / 255;
	const b = rgb[2] / 255;

	const k = Math.min(1 - r, 1 - g, 1 - b);
	const c = (1 - r - k) / (1 - k) || 0;
	const m = (1 - g - k) / (1 - k) || 0;
	const y = (1 - b - k) / (1 - k) || 0;

	return [c * 100, m * 100, y * 100, k * 100];
};

function comparativeDistance(x, y) {
	/*
		See https://en.m.wikipedia.org/wiki/Euclidean_distance#Squared_Euclidean_distance
	*/
	return (
		((x[0] - y[0]) ** 2) +
		((x[1] - y[1]) ** 2) +
		((x[2] - y[2]) ** 2)
	);
}

convert.rgb.keyword = function (rgb) {
	const reversed = reverseKeywords[rgb];
	if (reversed) {
		return reversed;
	}

	let currentClosestDistance = Infinity;
	let currentClosestKeyword;

	for (const keyword of Object.keys(cssKeywords)) {
		const value = cssKeywords[keyword];

		// Compute comparative distance
		const distance = comparativeDistance(rgb, value);

		// Check if its less, if so set as closest
		if (distance < currentClosestDistance) {
			currentClosestDistance = distance;
			currentClosestKeyword = keyword;
		}
	}

	return currentClosestKeyword;
};

convert.keyword.rgb = function (keyword) {
	return cssKeywords[keyword];
};

convert.rgb.xyz = function (rgb) {
	let r = rgb[0] / 255;
	let g = rgb[1] / 255;
	let b = rgb[2] / 255;

	// Assume sRGB
	r = r > 0.04045 ? (((r + 0.055) / 1.055) ** 2.4) : (r / 12.92);
	g = g > 0.04045 ? (((g + 0.055) / 1.055) ** 2.4) : (g / 12.92);
	b = b > 0.04045 ? (((b + 0.055) / 1.055) ** 2.4) : (b / 12.92);

	const x = (r * 0.4124) + (g * 0.3576) + (b * 0.1805);
	const y = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
	const z = (r * 0.0193) + (g * 0.1192) + (b * 0.9505);

	return [x * 100, y * 100, z * 100];
};

convert.rgb.lab = function (rgb) {
	const xyz = convert.rgb.xyz(rgb);
	let x = xyz[0];
	let y = xyz[1];
	let z = xyz[2];

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? (x ** (1 / 3)) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? (y ** (1 / 3)) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? (z ** (1 / 3)) : (7.787 * z) + (16 / 116);

	const l = (116 * y) - 16;
	const a = 500 * (x - y);
	const b = 200 * (y - z);

	return [l, a, b];
};

convert.hsl.rgb = function (hsl) {
	const h = hsl[0] / 360;
	const s = hsl[1] / 100;
	const l = hsl[2] / 100;
	let t2;
	let t3;
	let val;

	if (s === 0) {
		val = l * 255;
		return [val, val, val];
	}

	if (l < 0.5) {
		t2 = l * (1 + s);
	} else {
		t2 = l + s - l * s;
	}

	const t1 = 2 * l - t2;

	const rgb = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		t3 = h + 1 / 3 * -(i - 1);
		if (t3 < 0) {
			t3++;
		}

		if (t3 > 1) {
			t3--;
		}

		if (6 * t3 < 1) {
			val = t1 + (t2 - t1) * 6 * t3;
		} else if (2 * t3 < 1) {
			val = t2;
		} else if (3 * t3 < 2) {
			val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
		} else {
			val = t1;
		}

		rgb[i] = val * 255;
	}

	return rgb;
};

convert.hsl.hsv = function (hsl) {
	const h = hsl[0];
	let s = hsl[1] / 100;
	let l = hsl[2] / 100;
	let smin = s;
	const lmin = Math.max(l, 0.01);

	l *= 2;
	s *= (l <= 1) ? l : 2 - l;
	smin *= lmin <= 1 ? lmin : 2 - lmin;
	const v = (l + s) / 2;
	const sv = l === 0 ? (2 * smin) / (lmin + smin) : (2 * s) / (l + s);

	return [h, sv * 100, v * 100];
};

convert.hsv.rgb = function (hsv) {
	const h = hsv[0] / 60;
	const s = hsv[1] / 100;
	let v = hsv[2] / 100;
	const hi = Math.floor(h) % 6;

	const f = h - Math.floor(h);
	const p = 255 * v * (1 - s);
	const q = 255 * v * (1 - (s * f));
	const t = 255 * v * (1 - (s * (1 - f)));
	v *= 255;

	switch (hi) {
		case 0:
			return [v, t, p];
		case 1:
			return [q, v, p];
		case 2:
			return [p, v, t];
		case 3:
			return [p, q, v];
		case 4:
			return [t, p, v];
		case 5:
			return [v, p, q];
	}
};

convert.hsv.hsl = function (hsv) {
	const h = hsv[0];
	const s = hsv[1] / 100;
	const v = hsv[2] / 100;
	const vmin = Math.max(v, 0.01);
	let sl;
	let l;

	l = (2 - s) * v;
	const lmin = (2 - s) * vmin;
	sl = s * vmin;
	sl /= (lmin <= 1) ? lmin : 2 - lmin;
	sl = sl || 0;
	l /= 2;

	return [h, sl * 100, l * 100];
};

// http://dev.w3.org/csswg/css-color/#hwb-to-rgb
convert.hwb.rgb = function (hwb) {
	const h = hwb[0] / 360;
	let wh = hwb[1] / 100;
	let bl = hwb[2] / 100;
	const ratio = wh + bl;
	let f;

	// Wh + bl cant be > 1
	if (ratio > 1) {
		wh /= ratio;
		bl /= ratio;
	}

	const i = Math.floor(6 * h);
	const v = 1 - bl;
	f = 6 * h - i;

	if ((i & 0x01) !== 0) {
		f = 1 - f;
	}

	const n = wh + f * (v - wh); // Linear interpolation

	let r;
	let g;
	let b;
	/* eslint-disable max-statements-per-line,no-multi-spaces */
	switch (i) {
		default:
		case 6:
		case 0: r = v;  g = n;  b = wh; break;
		case 1: r = n;  g = v;  b = wh; break;
		case 2: r = wh; g = v;  b = n; break;
		case 3: r = wh; g = n;  b = v; break;
		case 4: r = n;  g = wh; b = v; break;
		case 5: r = v;  g = wh; b = n; break;
	}
	/* eslint-enable max-statements-per-line,no-multi-spaces */

	return [r * 255, g * 255, b * 255];
};

convert.cmyk.rgb = function (cmyk) {
	const c = cmyk[0] / 100;
	const m = cmyk[1] / 100;
	const y = cmyk[2] / 100;
	const k = cmyk[3] / 100;

	const r = 1 - Math.min(1, c * (1 - k) + k);
	const g = 1 - Math.min(1, m * (1 - k) + k);
	const b = 1 - Math.min(1, y * (1 - k) + k);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.rgb = function (xyz) {
	const x = xyz[0] / 100;
	const y = xyz[1] / 100;
	const z = xyz[2] / 100;
	let r;
	let g;
	let b;

	r = (x * 3.2406) + (y * -1.5372) + (z * -0.4986);
	g = (x * -0.9689) + (y * 1.8758) + (z * 0.0415);
	b = (x * 0.0557) + (y * -0.2040) + (z * 1.0570);

	// Assume sRGB
	r = r > 0.0031308
		? ((1.055 * (r ** (1.0 / 2.4))) - 0.055)
		: r * 12.92;

	g = g > 0.0031308
		? ((1.055 * (g ** (1.0 / 2.4))) - 0.055)
		: g * 12.92;

	b = b > 0.0031308
		? ((1.055 * (b ** (1.0 / 2.4))) - 0.055)
		: b * 12.92;

	r = Math.min(Math.max(0, r), 1);
	g = Math.min(Math.max(0, g), 1);
	b = Math.min(Math.max(0, b), 1);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.lab = function (xyz) {
	let x = xyz[0];
	let y = xyz[1];
	let z = xyz[2];

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? (x ** (1 / 3)) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? (y ** (1 / 3)) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? (z ** (1 / 3)) : (7.787 * z) + (16 / 116);

	const l = (116 * y) - 16;
	const a = 500 * (x - y);
	const b = 200 * (y - z);

	return [l, a, b];
};

convert.lab.xyz = function (lab) {
	const l = lab[0];
	const a = lab[1];
	const b = lab[2];
	let x;
	let y;
	let z;

	y = (l + 16) / 116;
	x = a / 500 + y;
	z = y - b / 200;

	const y2 = y ** 3;
	const x2 = x ** 3;
	const z2 = z ** 3;
	y = y2 > 0.008856 ? y2 : (y - 16 / 116) / 7.787;
	x = x2 > 0.008856 ? x2 : (x - 16 / 116) / 7.787;
	z = z2 > 0.008856 ? z2 : (z - 16 / 116) / 7.787;

	x *= 95.047;
	y *= 100;
	z *= 108.883;

	return [x, y, z];
};

convert.lab.lch = function (lab) {
	const l = lab[0];
	const a = lab[1];
	const b = lab[2];
	let h;

	const hr = Math.atan2(b, a);
	h = hr * 360 / 2 / Math.PI;

	if (h < 0) {
		h += 360;
	}

	const c = Math.sqrt(a * a + b * b);

	return [l, c, h];
};

convert.lch.lab = function (lch) {
	const l = lch[0];
	const c = lch[1];
	const h = lch[2];

	const hr = h / 360 * 2 * Math.PI;
	const a = c * Math.cos(hr);
	const b = c * Math.sin(hr);

	return [l, a, b];
};

convert.rgb.ansi16 = function (args, saturation = null) {
	const [r, g, b] = args;
	let value = saturation === null ? convert.rgb.hsv(args)[2] : saturation; // Hsv -> ansi16 optimization

	value = Math.round(value / 50);

	if (value === 0) {
		return 30;
	}

	let ansi = 30
		+ ((Math.round(b / 255) << 2)
		| (Math.round(g / 255) << 1)
		| Math.round(r / 255));

	if (value === 2) {
		ansi += 60;
	}

	return ansi;
};

convert.hsv.ansi16 = function (args) {
	// Optimization here; we already know the value and don't need to get
	// it converted for us.
	return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
};

convert.rgb.ansi256 = function (args) {
	const r = args[0];
	const g = args[1];
	const b = args[2];

	// We use the extended greyscale palette here, with the exception of
	// black and white. normal palette only has 4 greyscale shades.
	if (r === g && g === b) {
		if (r < 8) {
			return 16;
		}

		if (r > 248) {
			return 231;
		}

		return Math.round(((r - 8) / 247) * 24) + 232;
	}

	const ansi = 16
		+ (36 * Math.round(r / 255 * 5))
		+ (6 * Math.round(g / 255 * 5))
		+ Math.round(b / 255 * 5);

	return ansi;
};

convert.ansi16.rgb = function (args) {
	let color = args % 10;

	// Handle greyscale
	if (color === 0 || color === 7) {
		if (args > 50) {
			color += 3.5;
		}

		color = color / 10.5 * 255;

		return [color, color, color];
	}

	const mult = (~~(args > 50) + 1) * 0.5;
	const r = ((color & 1) * mult) * 255;
	const g = (((color >> 1) & 1) * mult) * 255;
	const b = (((color >> 2) & 1) * mult) * 255;

	return [r, g, b];
};

convert.ansi256.rgb = function (args) {
	// Handle greyscale
	if (args >= 232) {
		const c = (args - 232) * 10 + 8;
		return [c, c, c];
	}

	args -= 16;

	let rem;
	const r = Math.floor(args / 36) / 5 * 255;
	const g = Math.floor((rem = args % 36) / 6) / 5 * 255;
	const b = (rem % 6) / 5 * 255;

	return [r, g, b];
};

convert.rgb.hex = function (args) {
	const integer = ((Math.round(args[0]) & 0xFF) << 16)
		+ ((Math.round(args[1]) & 0xFF) << 8)
		+ (Math.round(args[2]) & 0xFF);

	const string = integer.toString(16).toUpperCase();
	return '000000'.substring(string.length) + string;
};

convert.hex.rgb = function (args) {
	const match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
	if (!match) {
		return [0, 0, 0];
	}

	let colorString = match[0];

	if (match[0].length === 3) {
		colorString = colorString.split('').map(char => {
			return char + char;
		}).join('');
	}

	const integer = parseInt(colorString, 16);
	const r = (integer >> 16) & 0xFF;
	const g = (integer >> 8) & 0xFF;
	const b = integer & 0xFF;

	return [r, g, b];
};

convert.rgb.hcg = function (rgb) {
	const r = rgb[0] / 255;
	const g = rgb[1] / 255;
	const b = rgb[2] / 255;
	const max = Math.max(Math.max(r, g), b);
	const min = Math.min(Math.min(r, g), b);
	const chroma = (max - min);
	let grayscale;
	let hue;

	if (chroma < 1) {
		grayscale = min / (1 - chroma);
	} else {
		grayscale = 0;
	}

	if (chroma <= 0) {
		hue = 0;
	} else
	if (max === r) {
		hue = ((g - b) / chroma) % 6;
	} else
	if (max === g) {
		hue = 2 + (b - r) / chroma;
	} else {
		hue = 4 + (r - g) / chroma;
	}

	hue /= 6;
	hue %= 1;

	return [hue * 360, chroma * 100, grayscale * 100];
};

convert.hsl.hcg = function (hsl) {
	const s = hsl[1] / 100;
	const l = hsl[2] / 100;

	const c = l < 0.5 ? (2.0 * s * l) : (2.0 * s * (1.0 - l));

	let f = 0;
	if (c < 1.0) {
		f = (l - 0.5 * c) / (1.0 - c);
	}

	return [hsl[0], c * 100, f * 100];
};

convert.hsv.hcg = function (hsv) {
	const s = hsv[1] / 100;
	const v = hsv[2] / 100;

	const c = s * v;
	let f = 0;

	if (c < 1.0) {
		f = (v - c) / (1 - c);
	}

	return [hsv[0], c * 100, f * 100];
};

convert.hcg.rgb = function (hcg) {
	const h = hcg[0] / 360;
	const c = hcg[1] / 100;
	const g = hcg[2] / 100;

	if (c === 0.0) {
		return [g * 255, g * 255, g * 255];
	}

	const pure = [0, 0, 0];
	const hi = (h % 1) * 6;
	const v = hi % 1;
	const w = 1 - v;
	let mg = 0;

	/* eslint-disable max-statements-per-line */
	switch (Math.floor(hi)) {
		case 0:
			pure[0] = 1; pure[1] = v; pure[2] = 0; break;
		case 1:
			pure[0] = w; pure[1] = 1; pure[2] = 0; break;
		case 2:
			pure[0] = 0; pure[1] = 1; pure[2] = v; break;
		case 3:
			pure[0] = 0; pure[1] = w; pure[2] = 1; break;
		case 4:
			pure[0] = v; pure[1] = 0; pure[2] = 1; break;
		default:
			pure[0] = 1; pure[1] = 0; pure[2] = w;
	}
	/* eslint-enable max-statements-per-line */

	mg = (1.0 - c) * g;

	return [
		(c * pure[0] + mg) * 255,
		(c * pure[1] + mg) * 255,
		(c * pure[2] + mg) * 255
	];
};

convert.hcg.hsv = function (hcg) {
	const c = hcg[1] / 100;
	const g = hcg[2] / 100;

	const v = c + g * (1.0 - c);
	let f = 0;

	if (v > 0.0) {
		f = c / v;
	}

	return [hcg[0], f * 100, v * 100];
};

convert.hcg.hsl = function (hcg) {
	const c = hcg[1] / 100;
	const g = hcg[2] / 100;

	const l = g * (1.0 - c) + 0.5 * c;
	let s = 0;

	if (l > 0.0 && l < 0.5) {
		s = c / (2 * l);
	} else
	if (l >= 0.5 && l < 1.0) {
		s = c / (2 * (1 - l));
	}

	return [hcg[0], s * 100, l * 100];
};

convert.hcg.hwb = function (hcg) {
	const c = hcg[1] / 100;
	const g = hcg[2] / 100;
	const v = c + g * (1.0 - c);
	return [hcg[0], (v - c) * 100, (1 - v) * 100];
};

convert.hwb.hcg = function (hwb) {
	const w = hwb[1] / 100;
	const b = hwb[2] / 100;
	const v = 1 - b;
	const c = v - w;
	let g = 0;

	if (c < 1) {
		g = (v - c) / (1 - c);
	}

	return [hwb[0], c * 100, g * 100];
};

convert.apple.rgb = function (apple) {
	return [(apple[0] / 65535) * 255, (apple[1] / 65535) * 255, (apple[2] / 65535) * 255];
};

convert.rgb.apple = function (rgb) {
	return [(rgb[0] / 255) * 65535, (rgb[1] / 255) * 65535, (rgb[2] / 255) * 65535];
};

convert.gray.rgb = function (args) {
	return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
};

convert.gray.hsl = function (args) {
	return [0, 0, args[0]];
};

convert.gray.hsv = convert.gray.hsl;

convert.gray.hwb = function (gray) {
	return [0, 100, gray[0]];
};

convert.gray.cmyk = function (gray) {
	return [0, 0, 0, gray[0]];
};

convert.gray.lab = function (gray) {
	return [gray[0], 0, 0];
};

convert.gray.hex = function (gray) {
	const val = Math.round(gray[0] / 100 * 255) & 0xFF;
	const integer = (val << 16) + (val << 8) + val;

	const string = integer.toString(16).toUpperCase();
	return '000000'.substring(string.length) + string;
};

convert.rgb.gray = function (rgb) {
	const val = (rgb[0] + rgb[1] + rgb[2]) / 3;
	return [val / 255 * 100];
};


/***/ }),

/***/ "./node_modules/ansi-styles/node_modules/color-convert/index.js":
/*!**********************************************************************!*\
  !*** ./node_modules/ansi-styles/node_modules/color-convert/index.js ***!
  \**********************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

const conversions = __webpack_require__(/*! ./conversions */ "./node_modules/ansi-styles/node_modules/color-convert/conversions.js");
const route = __webpack_require__(/*! ./route */ "./node_modules/ansi-styles/node_modules/color-convert/route.js");

const convert = {};

const models = Object.keys(conversions);

function wrapRaw(fn) {
	const wrappedFn = function (...args) {
		const arg0 = args[0];
		if (arg0 === undefined || arg0 === null) {
			return arg0;
		}

		if (arg0.length > 1) {
			args = arg0;
		}

		return fn(args);
	};

	// Preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

function wrapRounded(fn) {
	const wrappedFn = function (...args) {
		const arg0 = args[0];

		if (arg0 === undefined || arg0 === null) {
			return arg0;
		}

		if (arg0.length > 1) {
			args = arg0;
		}

		const result = fn(args);

		// We're assuming the result is an array here.
		// see notice in conversions.js; don't use box types
		// in conversion functions.
		if (typeof result === 'object') {
			for (let len = result.length, i = 0; i < len; i++) {
				result[i] = Math.round(result[i]);
			}
		}

		return result;
	};

	// Preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

models.forEach(fromModel => {
	convert[fromModel] = {};

	Object.defineProperty(convert[fromModel], 'channels', {value: conversions[fromModel].channels});
	Object.defineProperty(convert[fromModel], 'labels', {value: conversions[fromModel].labels});

	const routes = route(fromModel);
	const routeModels = Object.keys(routes);

	routeModels.forEach(toModel => {
		const fn = routes[toModel];

		convert[fromModel][toModel] = wrapRounded(fn);
		convert[fromModel][toModel].raw = wrapRaw(fn);
	});
});

module.exports = convert;


/***/ }),

/***/ "./node_modules/ansi-styles/node_modules/color-convert/route.js":
/*!**********************************************************************!*\
  !*** ./node_modules/ansi-styles/node_modules/color-convert/route.js ***!
  \**********************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

const conversions = __webpack_require__(/*! ./conversions */ "./node_modules/ansi-styles/node_modules/color-convert/conversions.js");

/*
	This function routes a model to all other models.

	all functions that are routed have a property `.conversion` attached
	to the returned synthetic function. This property is an array
	of strings, each with the steps in between the 'from' and 'to'
	color models (inclusive).

	conversions that are not possible simply are not included.
*/

function buildGraph() {
	const graph = {};
	// https://jsperf.com/object-keys-vs-for-in-with-closure/3
	const models = Object.keys(conversions);

	for (let len = models.length, i = 0; i < len; i++) {
		graph[models[i]] = {
			// http://jsperf.com/1-vs-infinity
			// micro-opt, but this is simple.
			distance: -1,
			parent: null
		};
	}

	return graph;
}

// https://en.wikipedia.org/wiki/Breadth-first_search
function deriveBFS(fromModel) {
	const graph = buildGraph();
	const queue = [fromModel]; // Unshift -> queue -> pop

	graph[fromModel].distance = 0;

	while (queue.length) {
		const current = queue.pop();
		const adjacents = Object.keys(conversions[current]);

		for (let len = adjacents.length, i = 0; i < len; i++) {
			const adjacent = adjacents[i];
			const node = graph[adjacent];

			if (node.distance === -1) {
				node.distance = graph[current].distance + 1;
				node.parent = current;
				queue.unshift(adjacent);
			}
		}
	}

	return graph;
}

function link(from, to) {
	return function (args) {
		return to(from(args));
	};
}

function wrapConversion(toModel, graph) {
	const path = [graph[toModel].parent, toModel];
	let fn = conversions[graph[toModel].parent][toModel];

	let cur = graph[toModel].parent;
	while (graph[cur].parent) {
		path.unshift(graph[cur].parent);
		fn = link(conversions[graph[cur].parent][cur], fn);
		cur = graph[cur].parent;
	}

	fn.conversion = path;
	return fn;
}

module.exports = function (fromModel) {
	const graph = deriveBFS(fromModel);
	const conversion = {};

	const models = Object.keys(graph);
	for (let len = models.length, i = 0; i < len; i++) {
		const toModel = models[i];
		const node = graph[toModel];

		if (node.parent === null) {
			// No possible conversion, or this node is the source model.
			continue;
		}

		conversion[toModel] = wrapConversion(toModel, graph);
	}

	return conversion;
};



/***/ }),

/***/ "./node_modules/chalk/node_modules/supports-color/index.js":
/*!*****************************************************************!*\
  !*** ./node_modules/chalk/node_modules/supports-color/index.js ***!
  \*****************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

const os = __webpack_require__(/*! os */ "os");
const tty = __webpack_require__(/*! tty */ "tty");
const hasFlag = __webpack_require__(/*! has-flag */ "./node_modules/has-flag/index.js");

const {env} = process;

let forceColor;
if (hasFlag('no-color') ||
	hasFlag('no-colors') ||
	hasFlag('color=false') ||
	hasFlag('color=never')) {
	forceColor = 0;
} else if (hasFlag('color') ||
	hasFlag('colors') ||
	hasFlag('color=true') ||
	hasFlag('color=always')) {
	forceColor = 1;
}

if ('FORCE_COLOR' in env) {
	if (env.FORCE_COLOR === 'true') {
		forceColor = 1;
	} else if (env.FORCE_COLOR === 'false') {
		forceColor = 0;
	} else {
		forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
	}
}

function translateLevel(level) {
	if (level === 0) {
		return false;
	}

	return {
		level,
		hasBasic: true,
		has256: level >= 2,
		has16m: level >= 3
	};
}

function supportsColor(haveStream, streamIsTTY) {
	if (forceColor === 0) {
		return 0;
	}

	if (hasFlag('color=16m') ||
		hasFlag('color=full') ||
		hasFlag('color=truecolor')) {
		return 3;
	}

	if (hasFlag('color=256')) {
		return 2;
	}

	if (haveStream && !streamIsTTY && forceColor === undefined) {
		return 0;
	}

	const min = forceColor || 0;

	if (env.TERM === 'dumb') {
		return min;
	}

	if (process.platform === 'win32') {
		// Windows 10 build 10586 is the first Windows release that supports 256 colors.
		// Windows 10 build 14931 is the first release that supports 16m/TrueColor.
		const osRelease = os.release().split('.');
		if (
			Number(osRelease[0]) >= 10 &&
			Number(osRelease[2]) >= 10586
		) {
			return Number(osRelease[2]) >= 14931 ? 3 : 2;
		}

		return 1;
	}

	if ('CI' in env) {
		if (['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI', 'GITHUB_ACTIONS', 'BUILDKITE'].some(sign => sign in env) || env.CI_NAME === 'codeship') {
			return 1;
		}

		return min;
	}

	if ('TEAMCITY_VERSION' in env) {
		return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
	}

	if (env.COLORTERM === 'truecolor') {
		return 3;
	}

	if ('TERM_PROGRAM' in env) {
		const version = parseInt((env.TERM_PROGRAM_VERSION || '').split('.')[0], 10);

		switch (env.TERM_PROGRAM) {
			case 'iTerm.app':
				return version >= 3 ? 3 : 2;
			case 'Apple_Terminal':
				return 2;
			// No default
		}
	}

	if (/-256(color)?$/i.test(env.TERM)) {
		return 2;
	}

	if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
		return 1;
	}

	if ('COLORTERM' in env) {
		return 1;
	}

	return min;
}

function getSupportLevel(stream) {
	const level = supportsColor(stream, stream && stream.isTTY);
	return translateLevel(level);
}

module.exports = {
	supportsColor: getSupportLevel,
	stdout: translateLevel(supportsColor(true, tty.isatty(1))),
	stderr: translateLevel(supportsColor(true, tty.isatty(2)))
};


/***/ }),

/***/ "./node_modules/chalk/source/index.js":
/*!********************************************!*\
  !*** ./node_modules/chalk/source/index.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

const ansiStyles = __webpack_require__(/*! ansi-styles */ "./node_modules/ansi-styles/index.js");
const {stdout: stdoutColor, stderr: stderrColor} = __webpack_require__(/*! supports-color */ "./node_modules/chalk/node_modules/supports-color/index.js");
const {
	stringReplaceAll,
	stringEncaseCRLFWithFirstIndex
} = __webpack_require__(/*! ./util */ "./node_modules/chalk/source/util.js");

const {isArray} = Array;

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = [
	'ansi',
	'ansi',
	'ansi256',
	'ansi16m'
];

const styles = Object.create(null);

const applyOptions = (object, options = {}) => {
	if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
		throw new Error('The `level` option should be an integer from 0 to 3');
	}

	// Detect level if not set manually
	const colorLevel = stdoutColor ? stdoutColor.level : 0;
	object.level = options.level === undefined ? colorLevel : options.level;
};

class ChalkClass {
	constructor(options) {
		// eslint-disable-next-line no-constructor-return
		return chalkFactory(options);
	}
}

const chalkFactory = options => {
	const chalk = {};
	applyOptions(chalk, options);

	chalk.template = (...arguments_) => chalkTag(chalk.template, ...arguments_);

	Object.setPrototypeOf(chalk, Chalk.prototype);
	Object.setPrototypeOf(chalk.template, chalk);

	chalk.template.constructor = () => {
		throw new Error('`chalk.constructor()` is deprecated. Use `new chalk.Instance()` instead.');
	};

	chalk.template.Instance = ChalkClass;

	return chalk.template;
};

function Chalk(options) {
	return chalkFactory(options);
}

for (const [styleName, style] of Object.entries(ansiStyles)) {
	styles[styleName] = {
		get() {
			const builder = createBuilder(this, createStyler(style.open, style.close, this._styler), this._isEmpty);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		}
	};
}

styles.visible = {
	get() {
		const builder = createBuilder(this, this._styler, true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	}
};

const usedModels = ['rgb', 'hex', 'keyword', 'hsl', 'hsv', 'hwb', 'ansi', 'ansi256'];

for (const model of usedModels) {
	styles[model] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(ansiStyles.color[levelMapping[level]][model](...arguments_), ansiStyles.color.close, this._styler);
				return createBuilder(this, styler, this._isEmpty);
			};
		}
	};
}

for (const model of usedModels) {
	const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
	styles[bgModel] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(ansiStyles.bgColor[levelMapping[level]][model](...arguments_), ansiStyles.bgColor.close, this._styler);
				return createBuilder(this, styler, this._isEmpty);
			};
		}
	};
}

const proto = Object.defineProperties(() => {}, {
	...styles,
	level: {
		enumerable: true,
		get() {
			return this._generator.level;
		},
		set(level) {
			this._generator.level = level;
		}
	}
});

const createStyler = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent
	};
};

const createBuilder = (self, _styler, _isEmpty) => {
	const builder = (...arguments_) => {
		if (isArray(arguments_[0]) && isArray(arguments_[0].raw)) {
			// Called as a template literal, for example: chalk.red`2 + 3 = {bold ${2+3}}`
			return applyStyle(builder, chalkTag(builder, ...arguments_));
		}

		// Single argument is hot path, implicit coercion is faster than anything
		// eslint-disable-next-line no-implicit-coercion
		return applyStyle(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));
	};

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto);

	builder._generator = self;
	builder._styler = _styler;
	builder._isEmpty = _isEmpty;

	return builder;
};

const applyStyle = (self, string) => {
	if (self.level <= 0 || !string) {
		return self._isEmpty ? '' : string;
	}

	let styler = self._styler;

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.indexOf('\u001B') !== -1) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

let template;
const chalkTag = (chalk, ...strings) => {
	const [firstString] = strings;

	if (!isArray(firstString) || !isArray(firstString.raw)) {
		// If chalk() was called by itself or with a string,
		// return the string itself as a string.
		return strings.join(' ');
	}

	const arguments_ = strings.slice(1);
	const parts = [firstString.raw[0]];

	for (let i = 1; i < firstString.length; i++) {
		parts.push(
			String(arguments_[i - 1]).replace(/[{}\\]/g, '\\$&'),
			String(firstString.raw[i])
		);
	}

	if (template === undefined) {
		template = __webpack_require__(/*! ./templates */ "./node_modules/chalk/source/templates.js");
	}

	return template(chalk, parts.join(''));
};

Object.defineProperties(Chalk.prototype, styles);

const chalk = Chalk(); // eslint-disable-line new-cap
chalk.supportsColor = stdoutColor;
chalk.stderr = Chalk({level: stderrColor ? stderrColor.level : 0}); // eslint-disable-line new-cap
chalk.stderr.supportsColor = stderrColor;

module.exports = chalk;


/***/ }),

/***/ "./node_modules/chalk/source/templates.js":
/*!************************************************!*\
  !*** ./node_modules/chalk/source/templates.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

const TEMPLATE_REGEX = /(?:\\(u(?:[a-f\d]{4}|\{[a-f\d]{1,6}\})|x[a-f\d]{2}|.))|(?:\{(~)?(\w+(?:\([^)]*\))?(?:\.\w+(?:\([^)]*\))?)*)(?:[ \t]|(?=\r?\n)))|(\})|((?:.|[\r\n\f])+?)/gi;
const STYLE_REGEX = /(?:^|\.)(\w+)(?:\(([^)]*)\))?/g;
const STRING_REGEX = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
const ESCAPE_REGEX = /\\(u(?:[a-f\d]{4}|{[a-f\d]{1,6}})|x[a-f\d]{2}|.)|([^\\])/gi;

const ESCAPES = new Map([
	['n', '\n'],
	['r', '\r'],
	['t', '\t'],
	['b', '\b'],
	['f', '\f'],
	['v', '\v'],
	['0', '\0'],
	['\\', '\\'],
	['e', '\u001B'],
	['a', '\u0007']
]);

function unescape(c) {
	const u = c[0] === 'u';
	const bracket = c[1] === '{';

	if ((u && !bracket && c.length === 5) || (c[0] === 'x' && c.length === 3)) {
		return String.fromCharCode(parseInt(c.slice(1), 16));
	}

	if (u && bracket) {
		return String.fromCodePoint(parseInt(c.slice(2, -1), 16));
	}

	return ESCAPES.get(c) || c;
}

function parseArguments(name, arguments_) {
	const results = [];
	const chunks = arguments_.trim().split(/\s*,\s*/g);
	let matches;

	for (const chunk of chunks) {
		const number = Number(chunk);
		if (!Number.isNaN(number)) {
			results.push(number);
		} else if ((matches = chunk.match(STRING_REGEX))) {
			results.push(matches[2].replace(ESCAPE_REGEX, (m, escape, character) => escape ? unescape(escape) : character));
		} else {
			throw new Error(`Invalid Chalk template style argument: ${chunk} (in style '${name}')`);
		}
	}

	return results;
}

function parseStyle(style) {
	STYLE_REGEX.lastIndex = 0;

	const results = [];
	let matches;

	while ((matches = STYLE_REGEX.exec(style)) !== null) {
		const name = matches[1];

		if (matches[2]) {
			const args = parseArguments(name, matches[2]);
			results.push([name].concat(args));
		} else {
			results.push([name]);
		}
	}

	return results;
}

function buildStyle(chalk, styles) {
	const enabled = {};

	for (const layer of styles) {
		for (const style of layer.styles) {
			enabled[style[0]] = layer.inverse ? null : style.slice(1);
		}
	}

	let current = chalk;
	for (const [styleName, styles] of Object.entries(enabled)) {
		if (!Array.isArray(styles)) {
			continue;
		}

		if (!(styleName in current)) {
			throw new Error(`Unknown Chalk style: ${styleName}`);
		}

		current = styles.length > 0 ? current[styleName](...styles) : current[styleName];
	}

	return current;
}

module.exports = (chalk, temporary) => {
	const styles = [];
	const chunks = [];
	let chunk = [];

	// eslint-disable-next-line max-params
	temporary.replace(TEMPLATE_REGEX, (m, escapeCharacter, inverse, style, close, character) => {
		if (escapeCharacter) {
			chunk.push(unescape(escapeCharacter));
		} else if (style) {
			const string = chunk.join('');
			chunk = [];
			chunks.push(styles.length === 0 ? string : buildStyle(chalk, styles)(string));
			styles.push({inverse, styles: parseStyle(style)});
		} else if (close) {
			if (styles.length === 0) {
				throw new Error('Found extraneous } in Chalk template literal');
			}

			chunks.push(buildStyle(chalk, styles)(chunk.join('')));
			chunk = [];
			styles.pop();
		} else {
			chunk.push(character);
		}
	});

	chunks.push(chunk.join(''));

	if (styles.length > 0) {
		const errMessage = `Chalk template literal is missing ${styles.length} closing bracket${styles.length === 1 ? '' : 's'} (\`}\`)`;
		throw new Error(errMessage);
	}

	return chunks.join('');
};


/***/ }),

/***/ "./node_modules/chalk/source/util.js":
/*!*******************************************!*\
  !*** ./node_modules/chalk/source/util.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const stringReplaceAll = (string, substring, replacer) => {
	let index = string.indexOf(substring);
	if (index === -1) {
		return string;
	}

	const substringLength = substring.length;
	let endIndex = 0;
	let returnValue = '';
	do {
		returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
		endIndex = index + substringLength;
		index = string.indexOf(substring, endIndex);
	} while (index !== -1);

	returnValue += string.substr(endIndex);
	return returnValue;
};

const stringEncaseCRLFWithFirstIndex = (string, prefix, postfix, index) => {
	let endIndex = 0;
	let returnValue = '';
	do {
		const gotCR = string[index - 1] === '\r';
		returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
		endIndex = index + 1;
		index = string.indexOf('\n', endIndex);
	} while (index !== -1);

	returnValue += string.substr(endIndex);
	return returnValue;
};

module.exports = {
	stringReplaceAll,
	stringEncaseCRLFWithFirstIndex
};


/***/ }),

/***/ "./node_modules/color-name/index.js":
/*!******************************************!*\
  !*** ./node_modules/color-name/index.js ***!
  \******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = {
	"aliceblue": [240, 248, 255],
	"antiquewhite": [250, 235, 215],
	"aqua": [0, 255, 255],
	"aquamarine": [127, 255, 212],
	"azure": [240, 255, 255],
	"beige": [245, 245, 220],
	"bisque": [255, 228, 196],
	"black": [0, 0, 0],
	"blanchedalmond": [255, 235, 205],
	"blue": [0, 0, 255],
	"blueviolet": [138, 43, 226],
	"brown": [165, 42, 42],
	"burlywood": [222, 184, 135],
	"cadetblue": [95, 158, 160],
	"chartreuse": [127, 255, 0],
	"chocolate": [210, 105, 30],
	"coral": [255, 127, 80],
	"cornflowerblue": [100, 149, 237],
	"cornsilk": [255, 248, 220],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"darkblue": [0, 0, 139],
	"darkcyan": [0, 139, 139],
	"darkgoldenrod": [184, 134, 11],
	"darkgray": [169, 169, 169],
	"darkgreen": [0, 100, 0],
	"darkgrey": [169, 169, 169],
	"darkkhaki": [189, 183, 107],
	"darkmagenta": [139, 0, 139],
	"darkolivegreen": [85, 107, 47],
	"darkorange": [255, 140, 0],
	"darkorchid": [153, 50, 204],
	"darkred": [139, 0, 0],
	"darksalmon": [233, 150, 122],
	"darkseagreen": [143, 188, 143],
	"darkslateblue": [72, 61, 139],
	"darkslategray": [47, 79, 79],
	"darkslategrey": [47, 79, 79],
	"darkturquoise": [0, 206, 209],
	"darkviolet": [148, 0, 211],
	"deeppink": [255, 20, 147],
	"deepskyblue": [0, 191, 255],
	"dimgray": [105, 105, 105],
	"dimgrey": [105, 105, 105],
	"dodgerblue": [30, 144, 255],
	"firebrick": [178, 34, 34],
	"floralwhite": [255, 250, 240],
	"forestgreen": [34, 139, 34],
	"fuchsia": [255, 0, 255],
	"gainsboro": [220, 220, 220],
	"ghostwhite": [248, 248, 255],
	"gold": [255, 215, 0],
	"goldenrod": [218, 165, 32],
	"gray": [128, 128, 128],
	"green": [0, 128, 0],
	"greenyellow": [173, 255, 47],
	"grey": [128, 128, 128],
	"honeydew": [240, 255, 240],
	"hotpink": [255, 105, 180],
	"indianred": [205, 92, 92],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"khaki": [240, 230, 140],
	"lavender": [230, 230, 250],
	"lavenderblush": [255, 240, 245],
	"lawngreen": [124, 252, 0],
	"lemonchiffon": [255, 250, 205],
	"lightblue": [173, 216, 230],
	"lightcoral": [240, 128, 128],
	"lightcyan": [224, 255, 255],
	"lightgoldenrodyellow": [250, 250, 210],
	"lightgray": [211, 211, 211],
	"lightgreen": [144, 238, 144],
	"lightgrey": [211, 211, 211],
	"lightpink": [255, 182, 193],
	"lightsalmon": [255, 160, 122],
	"lightseagreen": [32, 178, 170],
	"lightskyblue": [135, 206, 250],
	"lightslategray": [119, 136, 153],
	"lightslategrey": [119, 136, 153],
	"lightsteelblue": [176, 196, 222],
	"lightyellow": [255, 255, 224],
	"lime": [0, 255, 0],
	"limegreen": [50, 205, 50],
	"linen": [250, 240, 230],
	"magenta": [255, 0, 255],
	"maroon": [128, 0, 0],
	"mediumaquamarine": [102, 205, 170],
	"mediumblue": [0, 0, 205],
	"mediumorchid": [186, 85, 211],
	"mediumpurple": [147, 112, 219],
	"mediumseagreen": [60, 179, 113],
	"mediumslateblue": [123, 104, 238],
	"mediumspringgreen": [0, 250, 154],
	"mediumturquoise": [72, 209, 204],
	"mediumvioletred": [199, 21, 133],
	"midnightblue": [25, 25, 112],
	"mintcream": [245, 255, 250],
	"mistyrose": [255, 228, 225],
	"moccasin": [255, 228, 181],
	"navajowhite": [255, 222, 173],
	"navy": [0, 0, 128],
	"oldlace": [253, 245, 230],
	"olive": [128, 128, 0],
	"olivedrab": [107, 142, 35],
	"orange": [255, 165, 0],
	"orangered": [255, 69, 0],
	"orchid": [218, 112, 214],
	"palegoldenrod": [238, 232, 170],
	"palegreen": [152, 251, 152],
	"paleturquoise": [175, 238, 238],
	"palevioletred": [219, 112, 147],
	"papayawhip": [255, 239, 213],
	"peachpuff": [255, 218, 185],
	"peru": [205, 133, 63],
	"pink": [255, 192, 203],
	"plum": [221, 160, 221],
	"powderblue": [176, 224, 230],
	"purple": [128, 0, 128],
	"rebeccapurple": [102, 51, 153],
	"red": [255, 0, 0],
	"rosybrown": [188, 143, 143],
	"royalblue": [65, 105, 225],
	"saddlebrown": [139, 69, 19],
	"salmon": [250, 128, 114],
	"sandybrown": [244, 164, 96],
	"seagreen": [46, 139, 87],
	"seashell": [255, 245, 238],
	"sienna": [160, 82, 45],
	"silver": [192, 192, 192],
	"skyblue": [135, 206, 235],
	"slateblue": [106, 90, 205],
	"slategray": [112, 128, 144],
	"slategrey": [112, 128, 144],
	"snow": [255, 250, 250],
	"springgreen": [0, 255, 127],
	"steelblue": [70, 130, 180],
	"tan": [210, 180, 140],
	"teal": [0, 128, 128],
	"thistle": [216, 191, 216],
	"tomato": [255, 99, 71],
	"turquoise": [64, 224, 208],
	"violet": [238, 130, 238],
	"wheat": [245, 222, 179],
	"white": [255, 255, 255],
	"whitesmoke": [245, 245, 245],
	"yellow": [255, 255, 0],
	"yellowgreen": [154, 205, 50]
};


/***/ }),

/***/ "./node_modules/has-flag/index.js":
/*!****************************************!*\
  !*** ./node_modules/has-flag/index.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = (flag, argv = process.argv) => {
	const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
	const position = argv.indexOf(prefix + flag);
	const terminatorPosition = argv.indexOf('--');
	return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
};


/***/ }),

/***/ "./node_modules/is-node/index.js":
/*!***************************************!*\
  !*** ./node_modules/is-node/index.js ***!
  \***************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
// Coding standard for this project defined @ https://github.com/MatthewSH/standards/blob/master/JavaScript.md


exports = module.exports = !!(typeof process !== 'undefined' && process.versions && process.versions.node);


/***/ }),

/***/ "./node_modules/readline-sync/lib/readline-sync.js":
/*!*********************************************************!*\
  !*** ./node_modules/readline-sync/lib/readline-sync.js ***!
  \*********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*
 * readlineSync
 * https://github.com/anseki/readline-sync
 *
 * Copyright (c) 2019 anseki
 * Licensed under the MIT license.
 */



var
  IS_WIN = process.platform === 'win32',

  ALGORITHM_CIPHER = 'aes-256-cbc',
  ALGORITHM_HASH = 'sha256',
  DEFAULT_ERR_MSG = 'The current environment doesn\'t support interactive reading from TTY.',

  fs = __webpack_require__(/*! fs */ "fs"),
  TTY = process.binding('tty_wrap').TTY,
  childProc = __webpack_require__(/*! child_process */ "child_process"),
  pathUtil = __webpack_require__(/*! path */ "path"),

  defaultOptions = {
    /* eslint-disable key-spacing */
    prompt:             '> ',
    hideEchoBack:       false,
    mask:               '*',
    limit:              [],
    limitMessage:       'Input another, please.$<( [)limit(])>',
    defaultInput:       '',
    trueValue:          [],
    falseValue:         [],
    caseSensitive:      false,
    keepWhitespace:     false,
    encoding:           'utf8',
    bufferSize:         1024,
    print:              void 0,
    history:            true,
    cd:                 false,
    phContent:          void 0,
    preCheck:           void 0
    /* eslint-enable key-spacing */
  },

  fdR = 'none',
  isRawMode = false,
  salt = 0,
  lastInput = '',
  inputHistory = [],
  _DBG_useExt = false,
  _DBG_checkOptions = false,
  _DBG_checkMethod = false,
  fdW, ttyR, extHostPath, extHostArgs, tempdir, rawInput;

function getHostArgs(options) {
  // Send any text to crazy Windows shell safely.
  function encodeArg(arg) {
    return arg.replace(/[^\w\u0080-\uFFFF]/g, function(chr) {
      return '#' + chr.charCodeAt(0) + ';';
    });
  }

  return extHostArgs.concat((function(conf) {
    var args = [];
    Object.keys(conf).forEach(function(optionName) {
      if (conf[optionName] === 'boolean') {
        if (options[optionName]) { args.push('--' + optionName); }
      } else if (conf[optionName] === 'string') {
        if (options[optionName]) {
          args.push('--' + optionName, encodeArg(options[optionName]));
        }
      }
    });
    return args;
  })({
    /* eslint-disable key-spacing */
    display:        'string',
    displayOnly:    'boolean',
    keyIn:          'boolean',
    hideEchoBack:   'boolean',
    mask:           'string',
    limit:          'string',
    caseSensitive:  'boolean'
    /* eslint-enable key-spacing */
  }));
}

// piping via files (for Node.js v0.10-)
function _execFileSync(options, execOptions) {

  function getTempfile(name) {
    var suffix = '',
      filepath, fd;
    tempdir = tempdir || __webpack_require__(/*! os */ "os").tmpdir();

    while (true) {
      filepath = pathUtil.join(tempdir, name + suffix);
      try {
        fd = fs.openSync(filepath, 'wx');
      } catch (e) {
        if (e.code === 'EEXIST') {
          suffix++;
          continue;
        } else {
          throw e;
        }
      }
      fs.closeSync(fd);
      break;
    }
    return filepath;
  }

  var res = {},
    pathStdout = getTempfile('readline-sync.stdout'),
    pathStderr = getTempfile('readline-sync.stderr'),
    pathExit = getTempfile('readline-sync.exit'),
    pathDone = getTempfile('readline-sync.done'),
    crypto = __webpack_require__(/*! crypto */ "crypto"),
    hostArgs, shellPath, shellArgs, exitCode, extMessage, shasum, decipher, password;

  shasum = crypto.createHash(ALGORITHM_HASH);
  shasum.update('' + process.pid + (salt++) + Math.random());
  password = shasum.digest('hex');
  decipher = crypto.createDecipher(ALGORITHM_CIPHER, password);

  hostArgs = getHostArgs(options);
  if (IS_WIN) {
    shellPath = process.env.ComSpec || 'cmd.exe';
    process.env.Q = '"'; // The quote (") that isn't escaped.
    // `()` for ignore space by echo
    shellArgs = ['/V:ON', '/S', '/C',
      '(%Q%' + shellPath + '%Q% /V:ON /S /C %Q%' + /* ESLint bug? */ // eslint-disable-line no-path-concat
        '%Q%' + extHostPath + '%Q%' +
          hostArgs.map(function(arg) { return ' %Q%' + arg + '%Q%'; }).join('') +
        ' & (echo !ERRORLEVEL!)>%Q%' + pathExit + '%Q%%Q%) 2>%Q%' + pathStderr + '%Q%' +
      ' |%Q%' + process.execPath + '%Q% %Q%' + __dirname + '\\encrypt.js%Q%' +
        ' %Q%' + ALGORITHM_CIPHER + '%Q% %Q%' + password + '%Q%' +
        ' >%Q%' + pathStdout + '%Q%' +
      ' & (echo 1)>%Q%' + pathDone + '%Q%'];
  } else {
    shellPath = '/bin/sh';
    shellArgs = ['-c',
      // Use `()`, not `{}` for `-c` (text param)
      '("' + extHostPath + '"' + /* ESLint bug? */ // eslint-disable-line no-path-concat
          hostArgs.map(function(arg) { return " '" + arg.replace(/'/g, "'\\''") + "'"; }).join('') +
        '; echo $?>"' + pathExit + '") 2>"' + pathStderr + '"' +
      ' |"' + process.execPath + '" "' + __dirname + '/encrypt.js"' +
        ' "' + ALGORITHM_CIPHER + '" "' + password + '"' +
        ' >"' + pathStdout + '"' +
      '; echo 1 >"' + pathDone + '"'];
  }
  if (_DBG_checkMethod) { _DBG_checkMethod('_execFileSync', hostArgs); }
  try {
    childProc.spawn(shellPath, shellArgs, execOptions);
  } catch (e) {
    res.error = new Error(e.message);
    res.error.method = '_execFileSync - spawn';
    res.error.program = shellPath;
    res.error.args = shellArgs;
  }

  while (fs.readFileSync(pathDone, {encoding: options.encoding}).trim() !== '1') {} // eslint-disable-line no-empty
  if ((exitCode =
      fs.readFileSync(pathExit, {encoding: options.encoding}).trim()) === '0') {
    res.input =
      decipher.update(fs.readFileSync(pathStdout, {encoding: 'binary'}),
        'hex', options.encoding) +
      decipher.final(options.encoding);
  } else {
    extMessage = fs.readFileSync(pathStderr, {encoding: options.encoding}).trim();
    res.error = new Error(DEFAULT_ERR_MSG + (extMessage ? '\n' + extMessage : ''));
    res.error.method = '_execFileSync';
    res.error.program = shellPath;
    res.error.args = shellArgs;
    res.error.extMessage = extMessage;
    res.error.exitCode = +exitCode;
  }

  fs.unlinkSync(pathStdout);
  fs.unlinkSync(pathStderr);
  fs.unlinkSync(pathExit);
  fs.unlinkSync(pathDone);

  return res;
}

function readlineExt(options) {
  var res = {},
    execOptions = {env: process.env, encoding: options.encoding},
    hostArgs, extMessage;

  if (!extHostPath) {
    if (IS_WIN) {
      if (process.env.PSModulePath) { // Windows PowerShell
        extHostPath = 'powershell.exe';
        extHostArgs = ['-ExecutionPolicy', 'Bypass',
          '-File', __dirname + '\\read.ps1']; // eslint-disable-line no-path-concat
      } else { // Windows Script Host
        extHostPath = 'cscript.exe';
        extHostArgs = ['//nologo', __dirname + '\\read.cs.js']; // eslint-disable-line no-path-concat
      }
    } else {
      extHostPath = '/bin/sh';
      extHostArgs = [__dirname + '/read.sh']; // eslint-disable-line no-path-concat
    }
  }
  if (IS_WIN && !process.env.PSModulePath) { // Windows Script Host
    // ScriptPW (Win XP and Server2003) needs TTY stream as STDIN.
    // In this case, If STDIN isn't TTY, an error is thrown.
    execOptions.stdio = [process.stdin];
  }

  if (childProc.execFileSync) {
    hostArgs = getHostArgs(options);
    if (_DBG_checkMethod) { _DBG_checkMethod('execFileSync', hostArgs); }
    try {
      res.input = childProc.execFileSync(extHostPath, hostArgs, execOptions);
    } catch (e) { // non-zero exit code
      extMessage = e.stderr ? (e.stderr + '').trim() : '';
      res.error = new Error(DEFAULT_ERR_MSG + (extMessage ? '\n' + extMessage : ''));
      res.error.method = 'execFileSync';
      res.error.program = extHostPath;
      res.error.args = hostArgs;
      res.error.extMessage = extMessage;
      res.error.exitCode = e.status;
      res.error.code = e.code;
      res.error.signal = e.signal;
    }
  } else {
    res = _execFileSync(options, execOptions);
  }
  if (!res.error) {
    res.input = res.input.replace(/^\s*'|'\s*$/g, '');
    options.display = '';
  }

  return res;
}

/*
  display:            string
  displayOnly:        boolean
  keyIn:              boolean
  hideEchoBack:       boolean
  mask:               string
  limit:              string (pattern)
  caseSensitive:      boolean
  keepWhitespace:     boolean
  encoding, bufferSize, print
*/
function _readlineSync(options) {
  var input = '',
    displaySave = options.display,
    silent = !options.display && options.keyIn && options.hideEchoBack && !options.mask;

  function tryExt() {
    var res = readlineExt(options);
    if (res.error) { throw res.error; }
    return res.input;
  }

  if (_DBG_checkOptions) { _DBG_checkOptions(options); }

  (function() { // open TTY
    var fsB, constants, verNum;

    function getFsB() {
      if (!fsB) {
        fsB = process.binding('fs'); // For raw device path
        constants = process.binding('constants');
        // for v6.3.0+
        constants = constants && constants.fs && typeof constants.fs.O_RDWR === 'number'
          ? constants.fs : constants;
      }
      return fsB;
    }

    if (typeof fdR !== 'string') { return; }
    fdR = null;

    if (IS_WIN) {
      // iojs-v2.3.2+ input stream can't read first line. (#18)
      // ** Don't get process.stdin before check! **
      // Fixed v5.1.0
      // Fixed v4.2.4
      // It regressed again in v5.6.0, it is fixed in v6.2.0.
      verNum = (function(ver) { // getVerNum
        var nums = ver.replace(/^\D+/, '').split('.');
        var verNum = 0;
        if ((nums[0] = +nums[0])) { verNum += nums[0] * 10000; }
        if ((nums[1] = +nums[1])) { verNum += nums[1] * 100; }
        if ((nums[2] = +nums[2])) { verNum += nums[2]; }
        return verNum;
      })(process.version);
      if (!(verNum >= 20302 && verNum < 40204 || verNum >= 50000 && verNum < 50100 || verNum >= 50600 && verNum < 60200) &&
          process.stdin.isTTY) {
        process.stdin.pause();
        fdR = process.stdin.fd;
        ttyR = process.stdin._handle;
      } else {
        try {
          // The stream by fs.openSync('\\\\.\\CON', 'r') can't switch to raw mode.
          // 'CONIN$' might fail on XP, 2000, 7 (x86).
          fdR = getFsB().open('CONIN$', constants.O_RDWR, parseInt('0666', 8));
          ttyR = new TTY(fdR, true);
        } catch (e) { /* ignore */ }
      }

      if (process.stdout.isTTY) {
        fdW = process.stdout.fd;
      } else {
        try {
          fdW = fs.openSync('\\\\.\\CON', 'w');
        } catch (e) { /* ignore */ }
        if (typeof fdW !== 'number') { // Retry
          try {
            fdW = getFsB().open('CONOUT$', constants.O_RDWR, parseInt('0666', 8));
          } catch (e) { /* ignore */ }
        }
      }

    } else {
      if (process.stdin.isTTY) {
        process.stdin.pause();
        try {
          fdR = fs.openSync('/dev/tty', 'r'); // device file, not process.stdin
          ttyR = process.stdin._handle;
        } catch (e) { /* ignore */ }
      } else {
        // Node.js v0.12 read() fails.
        try {
          fdR = fs.openSync('/dev/tty', 'r');
          ttyR = new TTY(fdR, false);
        } catch (e) { /* ignore */ }
      }

      if (process.stdout.isTTY) {
        fdW = process.stdout.fd;
      } else {
        try {
          fdW = fs.openSync('/dev/tty', 'w');
        } catch (e) { /* ignore */ }
      }
    }
  })();

  (function() { // try read
    var isCooked = !options.hideEchoBack && !options.keyIn,
      atEol, limit, buffer, reqSize, readSize, chunk, line;
    rawInput = '';

    // Node.js v0.10- returns an error if same mode is set.
    function setRawMode(mode) {
      if (mode === isRawMode) { return true; }
      if (ttyR.setRawMode(mode) !== 0) { return false; }
      isRawMode = mode;
      return true;
    }

    if (_DBG_useExt || !ttyR ||
        typeof fdW !== 'number' && (options.display || !isCooked)) {
      input = tryExt();
      return;
    }

    if (options.display) {
      fs.writeSync(fdW, options.display);
      options.display = '';
    }
    if (options.displayOnly) { return; }

    if (!setRawMode(!isCooked)) {
      input = tryExt();
      return;
    }

    reqSize = options.keyIn ? 1 : options.bufferSize;
    // Check `allocUnsafe` to make sure of the new API.
    buffer = Buffer.allocUnsafe && Buffer.alloc ? Buffer.alloc(reqSize) : new Buffer(reqSize);

    if (options.keyIn && options.limit) {
      limit = new RegExp('[^' + options.limit + ']',
        'g' + (options.caseSensitive ? '' : 'i'));
    }

    while (true) {
      readSize = 0;
      try {
        readSize = fs.readSync(fdR, buffer, 0, reqSize);
      } catch (e) {
        if (e.code !== 'EOF') {
          setRawMode(false);
          input += tryExt();
          return;
        }
      }
      if (readSize > 0) {
        chunk = buffer.toString(options.encoding, 0, readSize);
        rawInput += chunk;
      } else {
        chunk = '\n';
        rawInput += String.fromCharCode(0);
      }

      if (chunk && typeof (line = (chunk.match(/^(.*?)[\r\n]/) || [])[1]) === 'string') {
        chunk = line;
        atEol = true;
      }

      // other ctrl-chars
      // eslint-disable-next-line no-control-regex
      if (chunk) { chunk = chunk.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); }
      if (chunk && limit) { chunk = chunk.replace(limit, ''); }

      if (chunk) {
        if (!isCooked) {
          if (!options.hideEchoBack) {
            fs.writeSync(fdW, chunk);
          } else if (options.mask) {
            fs.writeSync(fdW, (new Array(chunk.length + 1)).join(options.mask));
          }
        }
        input += chunk;
      }

      if (!options.keyIn && atEol ||
        options.keyIn && input.length >= reqSize) { break; }
    }

    if (!isCooked && !silent) { fs.writeSync(fdW, '\n'); }
    setRawMode(false);
  })();

  if (options.print && !silent) {
    options.print(
      displaySave + (
        options.displayOnly ? '' : (
          options.hideEchoBack ? (new Array(input.length + 1)).join(options.mask) : input
        ) + '\n' // must at least write '\n'
      ),
      options.encoding);
  }

  return options.displayOnly ? '' :
    (lastInput = options.keepWhitespace || options.keyIn ? input : input.trim());
}

function flattenArray(array, validator) {
  var flatArray = [];
  function _flattenArray(array) {
    if (array == null) { return; }
    if (Array.isArray(array)) {
      array.forEach(_flattenArray);
    } else if (!validator || validator(array)) {
      flatArray.push(array);
    }
  }
  _flattenArray(array);
  return flatArray;
}

function escapePattern(pattern) {
  return pattern.replace(/[\x00-\x7f]/g, // eslint-disable-line no-control-regex
    function(s) { return '\\x' + ('00' + s.charCodeAt().toString(16)).substr(-2); });
}

// margeOptions(options1, options2 ... )
// margeOptions(true, options1, options2 ... )
//    arg1=true : Start from defaultOptions and pick elements of that.
function margeOptions() {
  var optionsList = Array.prototype.slice.call(arguments),
    optionNames, fromDefault;

  if (optionsList.length && typeof optionsList[0] === 'boolean') {
    fromDefault = optionsList.shift();
    if (fromDefault) {
      optionNames = Object.keys(defaultOptions);
      optionsList.unshift(defaultOptions);
    }
  }

  return optionsList.reduce(function(options, optionsPart) {
    if (optionsPart == null) { return options; }

    // ======== DEPRECATED ========
    if (optionsPart.hasOwnProperty('noEchoBack') &&
        !optionsPart.hasOwnProperty('hideEchoBack')) {
      optionsPart.hideEchoBack = optionsPart.noEchoBack;
      delete optionsPart.noEchoBack;
    }
    if (optionsPart.hasOwnProperty('noTrim') &&
        !optionsPart.hasOwnProperty('keepWhitespace')) {
      optionsPart.keepWhitespace = optionsPart.noTrim;
      delete optionsPart.noTrim;
    }
    // ======== /DEPRECATED ========

    if (!fromDefault) { optionNames = Object.keys(optionsPart); }
    optionNames.forEach(function(optionName) {
      var value;
      if (!optionsPart.hasOwnProperty(optionName)) { return; }
      value = optionsPart[optionName];
      /* eslint-disable no-multi-spaces */
      switch (optionName) {
        //                    _readlineSync <- *    * -> defaultOptions
        // ================ string
        case 'mask':                        // *    *
        case 'limitMessage':                //      *
        case 'defaultInput':                //      *
        case 'encoding':                    // *    *
          value = value != null ? value + '' : '';
          if (value && optionName !== 'limitMessage') { value = value.replace(/[\r\n]/g, ''); }
          options[optionName] = value;
          break;
        // ================ number(int)
        case 'bufferSize':                  // *    *
          if (!isNaN(value = parseInt(value, 10)) && typeof value === 'number') {
            options[optionName] = value; // limited updating (number is needed)
          }
          break;
        // ================ boolean
        case 'displayOnly':                 // *
        case 'keyIn':                       // *
        case 'hideEchoBack':                // *    *
        case 'caseSensitive':               // *    *
        case 'keepWhitespace':              // *    *
        case 'history':                     //      *
        case 'cd':                          //      *
          options[optionName] = !!value;
          break;
        // ================ array
        case 'limit':                       // *    *     to string for readlineExt
        case 'trueValue':                   //      *
        case 'falseValue':                  //      *
          options[optionName] = flattenArray(value, function(value) {
            var type = typeof value;
            return type === 'string' || type === 'number' ||
              type === 'function' || value instanceof RegExp;
          }).map(function(value) {
            return typeof value === 'string' ? value.replace(/[\r\n]/g, '') : value;
          });
          break;
        // ================ function
        case 'print':                       // *    *
        case 'phContent':                   //      *
        case 'preCheck':                    //      *
          options[optionName] = typeof value === 'function' ? value : void 0;
          break;
        // ================ other
        case 'prompt':                      //      *
        case 'display':                     // *
          options[optionName] = value != null ? value : '';
          break;
        // no default
      }
      /* eslint-enable no-multi-spaces */
    });
    return options;
  }, {});
}

function isMatched(res, comps, caseSensitive) {
  return comps.some(function(comp) {
    var type = typeof comp;
    return type === 'string'
      ? (caseSensitive ? res === comp : res.toLowerCase() === comp.toLowerCase()) :
      type === 'number' ? parseFloat(res) === comp :
      type === 'function' ? comp(res) :
      comp instanceof RegExp ? comp.test(res) : false;
  });
}

function replaceHomePath(path, expand) {
  var homePath = pathUtil.normalize(
    IS_WIN ? (process.env.HOMEDRIVE || '') + (process.env.HOMEPATH || '') :
    process.env.HOME || '').replace(/[/\\]+$/, '');
  path = pathUtil.normalize(path);
  return expand ? path.replace(/^~(?=\/|\\|$)/, homePath) :
    path.replace(new RegExp('^' + escapePattern(homePath) +
      '(?=\\/|\\\\|$)', IS_WIN ? 'i' : ''), '~');
}

function replacePlaceholder(text, generator) {
  var PTN_INNER = '(?:\\(([\\s\\S]*?)\\))?(\\w+|.-.)(?:\\(([\\s\\S]*?)\\))?',
    rePlaceholder = new RegExp('(\\$)?(\\$<' + PTN_INNER + '>)', 'g'),
    rePlaceholderCompat = new RegExp('(\\$)?(\\$\\{' + PTN_INNER + '\\})', 'g');

  function getPlaceholderText(s, escape, placeholder, pre, param, post) {
    var text;
    return escape || typeof (text = generator(param)) !== 'string' ? placeholder :
      text ? (pre || '') + text + (post || '') : '';
  }

  return text.replace(rePlaceholder, getPlaceholderText)
    .replace(rePlaceholderCompat, getPlaceholderText);
}

function array2charlist(array, caseSensitive, collectSymbols) {
  var group = [],
    groupClass = -1,
    charCode = 0,
    symbols = '',
    values, suppressed;
  function addGroup(groups, group) {
    if (group.length > 3) { // ellipsis
      groups.push(group[0] + '...' + group[group.length - 1]);
      suppressed = true;
    } else if (group.length) {
      groups = groups.concat(group);
    }
    return groups;
  }

  values = array.reduce(function(chars, value) {
    return chars.concat((value + '').split(''));
  }, []).reduce(function(groups, curChar) {
    var curGroupClass, curCharCode;
    if (!caseSensitive) { curChar = curChar.toLowerCase(); }
    curGroupClass = /^\d$/.test(curChar) ? 1 :
      /^[A-Z]$/.test(curChar) ? 2 : /^[a-z]$/.test(curChar) ? 3 : 0;
    if (collectSymbols && curGroupClass === 0) {
      symbols += curChar;
    } else {
      curCharCode = curChar.charCodeAt(0);
      if (curGroupClass && curGroupClass === groupClass &&
          curCharCode === charCode + 1) {
        group.push(curChar);
      } else {
        groups = addGroup(groups, group);
        group = [curChar];
        groupClass = curGroupClass;
      }
      charCode = curCharCode;
    }
    return groups;
  }, []);
  values = addGroup(values, group); // last group
  if (symbols) { values.push(symbols); suppressed = true; }
  return {values: values, suppressed: suppressed};
}

function joinChunks(chunks, suppressed) {
  return chunks.join(chunks.length > 2 ? ', ' : suppressed ? ' / ' : '/');
}

function getPhContent(param, options) {
  var resCharlist = {},
    text, values, arg;
  if (options.phContent) {
    text = options.phContent(param, options);
  }
  if (typeof text !== 'string') {
    switch (param) {
      case 'hideEchoBack':
      case 'mask':
      case 'defaultInput':
      case 'caseSensitive':
      case 'keepWhitespace':
      case 'encoding':
      case 'bufferSize':
      case 'history':
      case 'cd':
        text = !options.hasOwnProperty(param) ? '' :
          typeof options[param] === 'boolean' ? (options[param] ? 'on' : 'off') :
          options[param] + '';
        break;
      // case 'prompt':
      // case 'query':
      // case 'display':
      //   text = options.hasOwnProperty('displaySrc') ? options.displaySrc + '' : '';
      //   break;
      case 'limit':
      case 'trueValue':
      case 'falseValue':
        values = options[options.hasOwnProperty(param + 'Src') ? param + 'Src' : param];
        if (options.keyIn) { // suppress
          resCharlist = array2charlist(values, options.caseSensitive);
          values = resCharlist.values;
        } else {
          values = values.filter(function(value) {
            var type = typeof value;
            return type === 'string' || type === 'number';
          });
        }
        text = joinChunks(values, resCharlist.suppressed);
        break;
      case 'limitCount':
      case 'limitCountNotZero':
        text = options[options.hasOwnProperty('limitSrc') ? 'limitSrc' : 'limit'].length;
        text = text || param !== 'limitCountNotZero' ? text + '' : '';
        break;
      case 'lastInput':
        text = lastInput;
        break;
      case 'cwd':
      case 'CWD':
      case 'cwdHome':
        text = process.cwd();
        if (param === 'CWD') {
          text = pathUtil.basename(text);
        } else if (param === 'cwdHome') {
          text = replaceHomePath(text);
        }
        break;
      case 'date':
      case 'time':
      case 'localeDate':
      case 'localeTime':
        text = (new Date())['to' +
          param.replace(/^./, function(str) { return str.toUpperCase(); }) +
          'String']();
        break;
      default: // with arg
        if (typeof (arg = (param.match(/^history_m(\d+)$/) || [])[1]) === 'string') {
          text = inputHistory[inputHistory.length - arg] || '';
        }
    }
  }
  return text;
}

function getPhCharlist(param) {
  var matches = /^(.)-(.)$/.exec(param),
    text = '',
    from, to, code, step;
  if (!matches) { return null; }
  from = matches[1].charCodeAt(0);
  to = matches[2].charCodeAt(0);
  step = from < to ? 1 : -1;
  for (code = from; code !== to + step; code += step) { text += String.fromCharCode(code); }
  return text;
}

// cmd "arg" " a r g " "" 'a"r"g' "a""rg" "arg
function parseCl(cl) {
  var reToken = new RegExp(/(\s*)(?:("|')(.*?)(?:\2|$)|(\S+))/g),
    taken = '',
    args = [],
    matches, part;
  cl = cl.trim();
  while ((matches = reToken.exec(cl))) {
    part = matches[3] || matches[4] || '';
    if (matches[1]) {
      args.push(taken);
      taken = '';
    }
    taken += part;
  }
  if (taken) { args.push(taken); }
  return args;
}

function toBool(res, options) {
  return (
    (options.trueValue.length &&
      isMatched(res, options.trueValue, options.caseSensitive)) ? true :
    (options.falseValue.length &&
      isMatched(res, options.falseValue, options.caseSensitive)) ? false : res);
}

function getValidLine(options) {
  var res, forceNext, limitMessage,
    matches, histInput, args, resCheck;

  function _getPhContent(param) { return getPhContent(param, options); }
  function addDisplay(text) { options.display += (/[^\r\n]$/.test(options.display) ? '\n' : '') + text; }

  options.limitSrc = options.limit;
  options.displaySrc = options.display;
  options.limit = ''; // for readlineExt
  options.display = replacePlaceholder(options.display + '', _getPhContent);

  while (true) {
    res = _readlineSync(options);
    forceNext = false;
    limitMessage = '';

    if (options.defaultInput && !res) { res = options.defaultInput; }

    if (options.history) {
      if ((matches = /^\s*!(?:!|-1)(:p)?\s*$/.exec(res))) { // `!!` `!-1` +`:p`
        histInput = inputHistory[0] || '';
        if (matches[1]) { // only display
          forceNext = true;
        } else { // replace input
          res = histInput;
        }
        // Show it even if it is empty (NL only).
        addDisplay(histInput + '\n');
        if (!forceNext) { // Loop may break
          options.displayOnly = true;
          _readlineSync(options);
          options.displayOnly = false;
        }
      } else if (res && res !== inputHistory[inputHistory.length - 1]) {
        inputHistory = [res];
      }
    }

    if (!forceNext && options.cd && res) {
      args = parseCl(res);
      switch (args[0].toLowerCase()) {
        case 'cd':
          if (args[1]) {
            try {
              process.chdir(replaceHomePath(args[1], true));
            } catch (e) {
              addDisplay(e + '');
            }
          }
          forceNext = true;
          break;
        case 'pwd':
          addDisplay(process.cwd());
          forceNext = true;
          break;
        // no default
      }
    }

    if (!forceNext && options.preCheck) {
      resCheck = options.preCheck(res, options);
      res = resCheck.res;
      if (resCheck.forceNext) { forceNext = true; } // Don't switch to false.
    }

    if (!forceNext) {
      if (!options.limitSrc.length ||
        isMatched(res, options.limitSrc, options.caseSensitive)) { break; }
      if (options.limitMessage) {
        limitMessage = replacePlaceholder(options.limitMessage, _getPhContent);
      }
    }

    addDisplay((limitMessage ? limitMessage + '\n' : '') +
      replacePlaceholder(options.displaySrc + '', _getPhContent));
  }
  return toBool(res, options);
}

// for dev
exports._DBG_set_useExt = function(val) { _DBG_useExt = val; };
exports._DBG_set_checkOptions = function(val) { _DBG_checkOptions = val; };
exports._DBG_set_checkMethod = function(val) { _DBG_checkMethod = val; };
exports._DBG_clearHistory = function() { lastInput = ''; inputHistory = []; };

// ------------------------------------

exports.setDefaultOptions = function(options) {
  defaultOptions = margeOptions(true, options);
  return margeOptions(true); // copy
};

exports.question = function(query, options) {
  /* eslint-disable key-spacing */
  return getValidLine(margeOptions(margeOptions(true, options), {
    display:            query
  }));
  /* eslint-enable key-spacing */
};

exports.prompt = function(options) {
  var readOptions = margeOptions(true, options);
  readOptions.display = readOptions.prompt;
  return getValidLine(readOptions);
};

exports.keyIn = function(query, options) {
  /* eslint-disable key-spacing */
  var readOptions = margeOptions(margeOptions(true, options), {
    display:            query,
    keyIn:              true,
    keepWhitespace:     true
  });
  /* eslint-enable key-spacing */

  // char list
  readOptions.limitSrc = readOptions.limit.filter(function(value) {
    var type = typeof value;
    return type === 'string' || type === 'number';
  }).map(function(text) {
    return replacePlaceholder(text + '', getPhCharlist);
  });
  // pattern
  readOptions.limit = escapePattern(readOptions.limitSrc.join(''));

  ['trueValue', 'falseValue'].forEach(function(optionName) {
    readOptions[optionName] = readOptions[optionName].reduce(function(comps, comp) {
      var type = typeof comp;
      if (type === 'string' || type === 'number') {
        comps = comps.concat((comp + '').split(''));
      } else { comps.push(comp); }
      return comps;
    }, []);
  });

  readOptions.display = replacePlaceholder(readOptions.display + '',
    function(param) { return getPhContent(param, readOptions); });

  return toBool(_readlineSync(readOptions), readOptions);
};

// ------------------------------------

exports.questionEMail = function(query, options) {
  if (query == null) { query = 'Input e-mail address: '; }
  /* eslint-disable key-spacing */
  return exports.question(query, margeOptions({
    // -------- default
    hideEchoBack:       false,
    // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address
    limit:              /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    limitMessage:       'Input valid e-mail address, please.',
    trueValue:          null,
    falseValue:         null
  }, options, {
    // -------- forced
    keepWhitespace:     false,
    cd:                 false
  }));
  /* eslint-enable key-spacing */
};

exports.questionNewPassword = function(query, options) {
  /* eslint-disable key-spacing */
  var resCharlist, min, max,
    readOptions = margeOptions({
      // -------- default
      hideEchoBack:       true,
      mask:               '*',
      limitMessage:       'It can include: $<charlist>\n' +
                            'And the length must be: $<length>',
      trueValue:          null,
      falseValue:         null,
      caseSensitive:      true
    }, options, {
      // -------- forced
      history:            false,
      cd:                 false,
      // limit (by charlist etc.),
      phContent: function(param) {
        return param === 'charlist' ? resCharlist.text :
          param === 'length' ? min + '...' + max : null;
      }
    }),
    // added:     charlist, min, max, confirmMessage, unmatchMessage
    charlist, confirmMessage, unmatchMessage,
    limit, limitMessage, res1, res2;
  /* eslint-enable key-spacing */
  options = options || {};

  charlist = replacePlaceholder(
    options.charlist ? options.charlist + '' : '$<!-~>', getPhCharlist);
  if (isNaN(min = parseInt(options.min, 10)) || typeof min !== 'number') { min = 12; }
  if (isNaN(max = parseInt(options.max, 10)) || typeof max !== 'number') { max = 24; }
  limit = new RegExp('^[' + escapePattern(charlist) +
    ']{' + min + ',' + max + '}$');
  resCharlist = array2charlist([charlist], readOptions.caseSensitive, true);
  resCharlist.text = joinChunks(resCharlist.values, resCharlist.suppressed);

  confirmMessage = options.confirmMessage != null ? options.confirmMessage :
    'Reinput a same one to confirm it: ';
  unmatchMessage = options.unmatchMessage != null ? options.unmatchMessage :
    'It differs from first one.' +
      ' Hit only the Enter key if you want to retry from first one.';

  if (query == null) { query = 'Input new password: '; }

  limitMessage = readOptions.limitMessage;
  while (!res2) {
    readOptions.limit = limit;
    readOptions.limitMessage = limitMessage;
    res1 = exports.question(query, readOptions);

    readOptions.limit = [res1, ''];
    readOptions.limitMessage = unmatchMessage;
    res2 = exports.question(confirmMessage, readOptions);
  }

  return res1;
};

function _questionNum(query, options, parser) {
  var validValue;
  function getValidValue(value) {
    validValue = parser(value);
    return !isNaN(validValue) && typeof validValue === 'number';
  }
  /* eslint-disable key-spacing */
  exports.question(query, margeOptions({
    // -------- default
    limitMessage:       'Input valid number, please.'
  }, options, {
    // -------- forced
    limit:              getValidValue,
    cd:                 false
    // trueValue, falseValue, caseSensitive, keepWhitespace don't work.
  }));
  /* eslint-enable key-spacing */
  return validValue;
}
exports.questionInt = function(query, options) {
  return _questionNum(query, options, function(value) { return parseInt(value, 10); });
};
exports.questionFloat = function(query, options) {
  return _questionNum(query, options, parseFloat);
};

exports.questionPath = function(query, options) {
  /* eslint-disable key-spacing */
  var error = '',
    validPath, // before readOptions
    readOptions = margeOptions({
      // -------- default
      hideEchoBack:       false,
      limitMessage:       '$<error(\n)>Input valid path, please.' +
                            '$<( Min:)min>$<( Max:)max>',
      history:            true,
      cd:                 true
    }, options, {
      // -------- forced
      keepWhitespace:     false,
      limit: function(value) {
        var exists, stat, res;
        value = replaceHomePath(value, true);
        error = ''; // for validate
        // mkdir -p
        function mkdirParents(dirPath) {
          dirPath.split(/\/|\\/).reduce(function(parents, dir) {
            var path = pathUtil.resolve((parents += dir + pathUtil.sep));
            if (!fs.existsSync(path)) {
              fs.mkdirSync(path);
            } else if (!fs.statSync(path).isDirectory()) {
              throw new Error('Non directory already exists: ' + path);
            }
            return parents;
          }, '');
        }

        try {
          exists = fs.existsSync(value);
          validPath = exists ? fs.realpathSync(value) : pathUtil.resolve(value);
          // options.exists default: true, not-bool: no-check
          if (!options.hasOwnProperty('exists') && !exists ||
              typeof options.exists === 'boolean' && options.exists !== exists) {
            error = (exists ? 'Already exists' : 'No such file or directory') +
              ': ' + validPath;
            return false;
          }
          if (!exists && options.create) {
            if (options.isDirectory) {
              mkdirParents(validPath);
            } else {
              mkdirParents(pathUtil.dirname(validPath));
              fs.closeSync(fs.openSync(validPath, 'w')); // touch
            }
            validPath = fs.realpathSync(validPath);
          }
          if (exists && (options.min || options.max ||
              options.isFile || options.isDirectory)) {
            stat = fs.statSync(validPath);
            // type check first (directory has zero size)
            if (options.isFile && !stat.isFile()) {
              error = 'Not file: ' + validPath;
              return false;
            } else if (options.isDirectory && !stat.isDirectory()) {
              error = 'Not directory: ' + validPath;
              return false;
            } else if (options.min && stat.size < +options.min ||
                options.max && stat.size > +options.max) {
              error = 'Size ' + stat.size + ' is out of range: ' + validPath;
              return false;
            }
          }
          if (typeof options.validate === 'function' &&
              (res = options.validate(validPath)) !== true) {
            if (typeof res === 'string') { error = res; }
            return false;
          }
        } catch (e) {
          error = e + '';
          return false;
        }
        return true;
      },
      // trueValue, falseValue, caseSensitive don't work.
      phContent: function(param) {
        return param === 'error' ? error :
          param !== 'min' && param !== 'max' ? null :
          options.hasOwnProperty(param) ? options[param] + '' : '';
      }
    });
    // added:     exists, create, min, max, isFile, isDirectory, validate
  /* eslint-enable key-spacing */
  options = options || {};

  if (query == null) { query = 'Input path (you can "cd" and "pwd"): '; }

  exports.question(query, readOptions);
  return validPath;
};

// props: preCheck, args, hRes, limit
function getClHandler(commandHandler, options) {
  var clHandler = {},
    hIndex = {};
  if (typeof commandHandler === 'object') {
    Object.keys(commandHandler).forEach(function(cmd) {
      if (typeof commandHandler[cmd] === 'function') {
        hIndex[options.caseSensitive ? cmd : cmd.toLowerCase()] = commandHandler[cmd];
      }
    });
    clHandler.preCheck = function(res) {
      var cmdKey;
      clHandler.args = parseCl(res);
      cmdKey = clHandler.args[0] || '';
      if (!options.caseSensitive) { cmdKey = cmdKey.toLowerCase(); }
      clHandler.hRes =
        cmdKey !== '_' && hIndex.hasOwnProperty(cmdKey)
          ? hIndex[cmdKey].apply(res, clHandler.args.slice(1)) :
          hIndex.hasOwnProperty('_') ? hIndex._.apply(res, clHandler.args) : null;
      return {res: res, forceNext: false};
    };
    if (!hIndex.hasOwnProperty('_')) {
      clHandler.limit = function() { // It's called after preCheck.
        var cmdKey = clHandler.args[0] || '';
        if (!options.caseSensitive) { cmdKey = cmdKey.toLowerCase(); }
        return hIndex.hasOwnProperty(cmdKey);
      };
    }
  } else {
    clHandler.preCheck = function(res) {
      clHandler.args = parseCl(res);
      clHandler.hRes = typeof commandHandler === 'function'
        ? commandHandler.apply(res, clHandler.args) : true; // true for break loop
      return {res: res, forceNext: false};
    };
  }
  return clHandler;
}

exports.promptCL = function(commandHandler, options) {
  /* eslint-disable key-spacing */
  var readOptions = margeOptions({
      // -------- default
      hideEchoBack:       false,
      limitMessage:       'Requested command is not available.',
      caseSensitive:      false,
      history:            true
    }, options),
    //   -------- forced
    //   trueValue, falseValue, keepWhitespace don't work.
    //   preCheck, limit (by clHandler)
    clHandler = getClHandler(commandHandler, readOptions);
  /* eslint-enable key-spacing */
  readOptions.limit = clHandler.limit;
  readOptions.preCheck = clHandler.preCheck;
  exports.prompt(readOptions);
  return clHandler.args;
};

exports.promptLoop = function(inputHandler, options) {
  /* eslint-disable key-spacing */
  var readOptions = margeOptions({
    // -------- default
    hideEchoBack:       false,
    trueValue:          null,
    falseValue:         null,
    caseSensitive:      false,
    history:            true
  }, options);
  /* eslint-enable key-spacing */
  while (true) { if (inputHandler(exports.prompt(readOptions))) { break; } }
  // return; // nothing is returned
};

exports.promptCLLoop = function(commandHandler, options) {
  /* eslint-disable key-spacing */
  var readOptions = margeOptions({
      // -------- default
      hideEchoBack:       false,
      limitMessage:       'Requested command is not available.',
      caseSensitive:      false,
      history:            true
    }, options),
    //   -------- forced
    //   trueValue, falseValue, keepWhitespace don't work.
    //   preCheck, limit (by clHandler)
    clHandler = getClHandler(commandHandler, readOptions);
  /* eslint-enable key-spacing */
  readOptions.limit = clHandler.limit;
  readOptions.preCheck = clHandler.preCheck;
  while (true) {
    exports.prompt(readOptions);
    if (clHandler.hRes) { break; }
  }
  // return; // nothing is returned
};

exports.promptSimShell = function(options) {
  /* eslint-disable key-spacing */
  return exports.prompt(margeOptions({
    // -------- default
    hideEchoBack:       false,
    history:            true
  }, options, {
    // -------- forced
    prompt:             (function() {
      return IS_WIN ? '$<cwd>>' :
        // 'user@host:cwd$ '
        (process.env.USER || '') +
        (process.env.HOSTNAME ? '@' + process.env.HOSTNAME.replace(/\..*$/, '') : '') +
        ':$<cwdHome>$ ';
    })()
  }));
  /* eslint-enable key-spacing */
};

function _keyInYN(query, options, limit) {
  var res;
  if (query == null) { query = 'Are you sure? '; }
  if ((!options || options.guide !== false) && (query += '')) {
    query = query.replace(/\s*:?\s*$/, '') + ' [y/n]: ';
  }
  /* eslint-disable key-spacing */
  res = exports.keyIn(query, margeOptions(options, {
    // -------- forced
    hideEchoBack:       false,
    limit:              limit,
    trueValue:          'y',
    falseValue:         'n',
    caseSensitive:      false
    // mask doesn't work.
  }));
  // added:     guide
  /* eslint-enable key-spacing */
  return typeof res === 'boolean' ? res : '';
}
exports.keyInYN = function(query, options) { return _keyInYN(query, options); };
exports.keyInYNStrict = function(query, options) { return _keyInYN(query, options, 'yn'); };

exports.keyInPause = function(query, options) {
  if (query == null) { query = 'Continue...'; }
  if ((!options || options.guide !== false) && (query += '')) {
    query = query.replace(/\s+$/, '') + ' (Hit any key)';
  }
  /* eslint-disable key-spacing */
  exports.keyIn(query, margeOptions({
    // -------- default
    limit:              null
  }, options, {
    // -------- forced
    hideEchoBack:       true,
    mask:               ''
  }));
  // added:     guide
  /* eslint-enable key-spacing */
  // return; // nothing is returned
};

exports.keyInSelect = function(items, query, options) {
  /* eslint-disable key-spacing */
  var readOptions = margeOptions({
      // -------- default
      hideEchoBack:       false
    }, options, {
      // -------- forced
      trueValue:          null,
      falseValue:         null,
      caseSensitive:      false,
      // limit (by items),
      phContent: function(param) {
        return param === 'itemsCount' ? items.length + '' :
          param === 'firstItem' ? (items[0] + '').trim() :
          param === 'lastItem' ? (items[items.length - 1] + '').trim() : null;
      }
    }),
    // added:     guide, cancel
    keylist = '',
    key2i = {},
    charCode = 49 /* '1' */,
    display = '\n';
  /* eslint-enable key-spacing */
  if (!Array.isArray(items) || !items.length || items.length > 35) {
    throw '`items` must be Array (max length: 35).';
  }

  items.forEach(function(item, i) {
    var key = String.fromCharCode(charCode);
    keylist += key;
    key2i[key] = i;
    display += '[' + key + '] ' + (item + '').trim() + '\n';
    charCode = charCode === 57 /* '9' */ ? 97 /* 'a' */ : charCode + 1;
  });
  if (!options || options.cancel !== false) {
    keylist += '0';
    key2i['0'] = -1;
    display += '[0] ' +
      (options && options.cancel != null && typeof options.cancel !== 'boolean'
        ? (options.cancel + '').trim() : 'CANCEL') + '\n';
  }
  readOptions.limit = keylist;
  display += '\n';

  if (query == null) { query = 'Choose one from list: '; }
  if ((query += '')) {
    if (!options || options.guide !== false) {
      query = query.replace(/\s*:?\s*$/, '') + ' [$<limit>]: ';
    }
    display += query;
  }

  return key2i[exports.keyIn(display, readOptions).toLowerCase()];
};

exports.getRawInput = function() { return rawInput; };

// ======== DEPRECATED ========
function _setOption(optionName, args) {
  var options;
  if (args.length) { options = {}; options[optionName] = args[0]; }
  return exports.setDefaultOptions(options)[optionName];
}
exports.setPrint = function() { return _setOption('print', arguments); };
exports.setPrompt = function() { return _setOption('prompt', arguments); };
exports.setEncoding = function() { return _setOption('encoding', arguments); };
exports.setMask = function() { return _setOption('mask', arguments); };
exports.setBufferSize = function() { return _setOption('bufferSize', arguments); };


/***/ }),

/***/ "./node_modules/webpack/buildin/module.js":
/*!***********************************!*\
  !*** (webpack)/buildin/module.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = function(module) {
	if (!module.webpackPolyfill) {
		module.deprecate = function() {};
		module.paths = [];
		// module.parent = undefined by default
		if (!module.children) module.children = [];
		Object.defineProperty(module, "loaded", {
			enumerable: true,
			get: function() {
				return module.l;
			}
		});
		Object.defineProperty(module, "id", {
			enumerable: true,
			get: function() {
				return module.i;
			}
		});
		module.webpackPolyfill = 1;
	}
	return module;
};


/***/ }),

/***/ "./src/mal/env.ts":
/*!************************!*\
  !*** ./src/mal/env.ts ***!
  \************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return Env; });
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");

class Env {
    constructor({ outer = null, name = 'let', forms, exps, } = {}) {
        this.data = new Map();
        this.bindings = [];
        this.outer = outer;
        this.name = name;
        if (forms && exps) {
            this.bind(_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(forms), _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(exps));
        }
    }
    root() {
        if (this.outer) {
            return this.outer.root();
        }
        else {
            return this;
        }
    }
    getAllSymbols() {
        const merged = this.outer
            ? new Map(Object.assign(Object.assign({}, this.outer.data), this.data))
            : this.data;
        return [...merged.keys()].map(_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create);
    }
    /**
     * Returns a new Env with symbols in binds bound to
     * corresponding values in exps
     */
    bind(forms, exps) {
        if (_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(forms)) {
            if (!exps) {
                throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`[${this.name}] parameter '${forms.print()}' is not specified`);
            }
            this.set(forms.value, exps);
        }
        else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].is(forms)) {
            if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].is(exps)) {
                throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`[${this.name}] The destruction parameter ${forms.print()} is not specified as vector`);
            }
            for (let i = 0; i < forms.value.length; i++) {
                const form = forms.value[i];
                const exp = exps.value[i];
                if (_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].isFor(form, '&')) {
                    // rest arguments
                    this.set(forms.value[i + 1].value, _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(exps.value.slice(i)));
                    i++;
                    continue;
                }
                else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalKeyword"].isFor(form, 'as')) {
                    // :as destruction
                    this.set(forms.value[i + 1].value, exp);
                    break;
                }
                this.bind(form, exp);
            }
        }
        else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(forms)) {
            if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(exps)) {
                throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`[${this.name}] The destruction parameter ${forms.print()} is not specified as map`);
            }
            for (const [key, form] of forms.entries()) {
                if (key === 'as') {
                    // :as destruction
                    if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(form))
                        throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"]('Invalid :as');
                    this.set(form.value, exps);
                    continue;
                }
                else {
                    if (!(key in exps.value)) {
                        throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`[${this.name}] The destruction keyword :${key} does not exist on the parameter`);
                    }
                    this.bind(form, exps.value[key]);
                }
            }
        }
    }
    set(symbol, value) {
        this.data.set(symbol, value);
        return value;
    }
    find(symbol) {
        // First, search binding
        const bindings = this.root().bindings;
        if (bindings.length > 0) {
            const bindingEnv = bindings[bindings.length - 1];
            const value = bindingEnv.find(symbol);
            if (value !== undefined) {
                return value;
            }
        }
        // Seek in current env
        if (this.data.has(symbol)) {
            return this.data.get(symbol);
        }
        if (this.outer !== null) {
            return this.outer.find(symbol);
        }
    }
    hasOwn(symbol) {
        return this.data.has(symbol);
    }
    get(symbol) {
        const value = this.find(symbol);
        if (value === undefined) {
            throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`[${this.name}] Use of undeclared symbol ${symbol}`);
        }
        return value;
    }
    getChain() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let _env = this;
        const envs = [...this.root().bindings.reverse()];
        do {
            envs.push(_env);
            _env = _env.outer;
        } while (_env);
        return envs;
    }
    pushBinding(env) {
        const bindings = this.root().bindings;
        const outer = bindings.length > 0 ? bindings[bindings.length - 1] : null;
        env.outer = outer;
        bindings.push(env);
        return env;
    }
    popBinding() {
        this.root().bindings.pop();
    }
}


/***/ }),

/***/ "./src/mal/eval.ts":
/*!*************************!*\
  !*** ./src/mal/eval.ts ***!
  \*************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return evalExp; });
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");
/* harmony import */ var _env__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./env */ "./src/mal/env.ts");
/* harmony import */ var _special_forms_meta__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./special-forms-meta */ "./src/mal/special-forms-meta.ts");



// import {setExpandInfo, ExpandType} from './expand'
function quasiquote(exp) {
    if (_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(exp)) {
        const ret = {};
        for (const [k, v] of exp.entries()) {
            ret[k] = quasiquote(v);
        }
        return _types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].create(ret);
    }
    if (!isPair(exp)) {
        const ret = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('quote'), exp]);
        ret.sugar = "'";
        return ret;
    }
    if (_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].isFor(exp.value[0], 'unquote')) {
        return exp.value[1];
    }
    const ret = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([
        _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('concat'),
        ...exp.value.map(e => {
            if (_types__WEBPACK_IMPORTED_MODULE_0__["MalList"].isCallOf(e, 'splice-unquote')) {
                return e.value[1];
            }
            else {
                return _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create([quasiquote(e)]);
            }
        }),
    ]);
    return _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].is(exp) ? _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('lst'), ret]) : ret;
    function isPair(x) {
        return Object(_types__WEBPACK_IMPORTED_MODULE_0__["isMalSeq"])(x) && x.value.length > 0;
    }
}
function macroexpand(_exp, env) {
    let exp = _exp;
    let fn;
    while (_types__WEBPACK_IMPORTED_MODULE_0__["MalList"].is(exp) &&
        _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(exp.first) &&
        (fn = env.find(exp.first.value))) {
        if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalMacro"].is(fn)) {
            break;
        }
        exp.first.evaluated = fn;
        exp = fn.value.apply({ callerEnv: env }, exp.rest);
    }
    // if (exp !== _exp && MalList.is(_exp)) {
    // 	setExpandInfo(_exp, {type: ExpandType.Constant, exp})
    // }
    return exp;
}
function getUnnamedParamsInfo(exp) {
    // Traverse body
    let paramCount = 0, hasRest = false;
    traverse(exp);
    return { paramCount, hasRest };
    function traverse(exp) {
        switch (exp.type) {
            case _types__WEBPACK_IMPORTED_MODULE_0__["MalType"].List:
            case _types__WEBPACK_IMPORTED_MODULE_0__["MalType"].Vector:
                exp.value.forEach(traverse);
                break;
            case _types__WEBPACK_IMPORTED_MODULE_0__["MalType"].Map:
                exp.values().forEach(traverse);
                break;
            case _types__WEBPACK_IMPORTED_MODULE_0__["MalType"].Symbol:
                if (exp.value.startsWith('%')) {
                    if (exp.value === '%&') {
                        hasRest = true;
                    }
                    else {
                        const c = parseInt(exp.value.slice(1) || '1');
                        paramCount = Math.max(paramCount, c);
                    }
                }
                break;
        }
    }
}
function evalExp(exp, env) {
    const origExp = exp;
    let counter = 0;
    while (counter++ < 1e7) {
        // Expand macro
        exp = macroexpand(exp, env);
        // evalAtom
        if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalList"].is(exp)) {
            let ret;
            if (_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(exp)) {
                ret = env.get(exp.value);
            }
            else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].is(exp)) {
                ret = _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(exp.value.map(x => evalExp.call(this, x, env)));
            }
            else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(exp)) {
                ret = _types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].create(Object.fromEntries(exp.entries().map(([k, v]) => [k, evalExp.call(this, v, env)])));
            }
            if (ret) {
                origExp.evaluated = ret;
            }
            return ret || exp;
        }
        // Eval () as nil
        if (exp.value.length === 0) {
            ;
            origExp.evaluated = _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
        }
        // Apply list
        const first = _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(exp.first) ? exp.first.value : null;
        switch (first) {
            case 'def': {
                // NOTE: disable defvar
                // case 'defvar': {
                const [, sym, form] = exp.value;
                if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(sym) || form === undefined) {
                    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"]('Invalid form of def');
                }
                const ret = evalExp.call(this, form, env);
                env.set(sym.value, ret);
                // setExpandInfo(exp, {
                // 	type: ExpandType.Unchange,
                // })
                origExp.evaluated = ret;
                return ret;
            }
            case 'let': {
                const letEnv = new _env__WEBPACK_IMPORTED_MODULE_1__["default"]({ name: 'let', outer: env });
                const [, binds, ...body] = exp.value;
                if (!_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].is(binds)) {
                    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"]('let requires a vector for its binding');
                }
                for (let i = 0; i < binds.value.length; i += 2) {
                    letEnv.bind(binds.value[i], evalExp.call(this, binds.value[i + 1], letEnv));
                }
                env = letEnv;
                exp =
                    body.length === 1
                        ? body[0]
                        : _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('do'), ...body]);
                break; // continue TCO loop
            }
            // case 'binding': {
            // 	const bindingEnv = new Env({name: 'binding'})
            // 	const [, binds, ..._body] = exp.value
            // 	if (!MalVector.is(binds)) {
            // 		throw new MalError('Invalid bind-expr in binding')
            // 	}
            // 	for (let i = 0; i < binds.value.length; i += 2) {
            // 		bindingEnv.bind(
            // 			binds.value[i],
            // 			evalExp.call(this, binds.value[i + 1], env)
            // 		)
            // 	}
            // 	env.pushBinding(bindingEnv)
            // 	const body =
            // 		_body.length === 1
            // 			? _body[0]
            // 			: MalList.create(MalSymbol.create('do'), ..._body)
            // 	let ret
            // 	try {
            // 		ret = evalExp.call(this, body, env)
            // 	} finally {
            // 		env.popBinding()
            // 	}
            // 	origExp.evaluated = ret
            // 	return ret
            // }
            // case 'get-all-symbols': {
            // 	const ret = MalVector.create(...env.getAllSymbols())
            // 	origExp.evaluated = ret
            // 	return ret
            // }
            // case 'fn-params': {
            // 	const fn = evalExp.call(this, exp.value[1], env)
            // 	const ret = MalFn.is(fn)
            // 		? MalVector.create(...fn.params)
            // 		: MalNil.create()
            // 	origExp.evaluated = ret
            // 	return ret
            // }
            // case 'eval*': {
            // 	// if (!this) {
            // 	// 	throw new MalError('Cannot find the caller env')
            // 	// }
            // 	const expanded = evalExp.call(this, exp.value[1], env)
            // 	exp = evalExp.call(this, expanded, this ? this.callerEnv : env)
            // 	break // continue TCO loop
            // }
            case 'quote': {
                const ret = exp.value[1];
                origExp.evaluated = ret;
                return ret;
            }
            case 'quasiquote': {
                exp = quasiquote(exp.value[1]);
                break; // continue TCO loop
            }
            case 'fn-sugar': {
                const body = exp.value[1];
                const { paramCount, hasRest } = getUnnamedParamsInfo(exp);
                const params = _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create();
                for (let i = 1; i <= paramCount; i++) {
                    params.value.push(_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create(`%${i}`));
                }
                if (hasRest) {
                    params.value.push(_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('&'), _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('%&'));
                }
                exp = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('fn'), params, body]);
                break; // continue TCO loop
            }
            case 'fn':
            case 'macro': {
                const [, _params, body] = exp.value;
                let params;
                if (_types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].is(_params)) {
                    params = _params;
                }
                else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(_params)) {
                    params = _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create([_params]);
                }
                if (params === undefined) {
                    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`The parameter of ${first} should be vector or map`);
                }
                if (body === undefined) {
                    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"](`The body of ${first} is empty`);
                }
                const ret = (first === 'fn' ? _types__WEBPACK_IMPORTED_MODULE_0__["MalFn"] : _types__WEBPACK_IMPORTED_MODULE_0__["MalMacro"]).create((...args) => {
                    return evalExp.call(this, body, new _env__WEBPACK_IMPORTED_MODULE_1__["default"]({ outer: env, forms: params === null || params === void 0 ? void 0 : params.value, exps: args }));
                });
                ret.ast = {
                    body,
                    env,
                    params,
                };
                origExp.evaluated = ret;
                return ret;
            }
            case 'macroexpand': {
                const ret = macroexpand(exp.value[1], env);
                origExp.evaluated = ret;
                return ret;
            }
            case 'try': {
                const [, testExp, catchExp] = exp.value;
                try {
                    const ret = evalExp.call(this, testExp, env);
                    origExp.evaluated = ret;
                    return ret;
                }
                catch (err) {
                    if (_types__WEBPACK_IMPORTED_MODULE_0__["MalList"].isCallOf(catchExp, 'catch') &&
                        _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(catchExp.value[1])) {
                        catchExp.value[1].evaluated = _special_forms_meta__WEBPACK_IMPORTED_MODULE_2__["default"]['catch'];
                        const [, errSym, errBody] = catchExp.value;
                        const message = _types__WEBPACK_IMPORTED_MODULE_0__["MalString"].create(err instanceof Error ? err.message : 'Error');
                        const ret = evalExp.call(this, errBody, new _env__WEBPACK_IMPORTED_MODULE_1__["default"]({
                            outer: env,
                            forms: [errSym],
                            exps: [message],
                            name: 'catch',
                        }));
                        origExp.evaluated = ret;
                        return ret;
                    }
                    else {
                        throw err;
                    }
                }
            }
            case 'do': {
                if (exp.value.length === 1) {
                    origExp.evaluated = _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
                    return _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
                }
                evalExp.call(this, _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(exp.value.slice(1, -1)), env);
                exp = exp.value[exp.value.length - 1];
                break; // continue TCO loop
            }
            case 'if': {
                const [, _test, thenExp, elseExp] = exp.value;
                const test = evalExp.call(this, _test, env);
                exp = test.value ? thenExp : elseExp || _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
                break; // continue TCO loop
            }
            default: {
                // is a function call
                // Evaluate all of parameters at first
                const [fn, ...params] = exp.value.map(e => evalExp.call(this, e, env));
                if (_types__WEBPACK_IMPORTED_MODULE_0__["MalFn"].is(fn)) {
                    exp.first.evaluated = fn;
                    if (fn.ast) {
                        // Lisp-defined functions
                        env = new _env__WEBPACK_IMPORTED_MODULE_1__["default"]({
                            outer: fn.ast.env,
                            forms: fn.ast.params.value,
                            exps: params,
                            name: _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].is(exp.first) ? exp.first.value : 'anonymous',
                        });
                        exp = fn.ast.body;
                        // continue TCO loop
                        break;
                    }
                    else {
                        // JS-defined functions
                        const ret = fn.value.apply({ callerEnv: env }, params);
                        origExp.evaluated = ret;
                        return ret;
                    }
                }
                else {
                    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"]('Invalid first');
                }
            }
        }
    }
    throw new _types__WEBPACK_IMPORTED_MODULE_0__["MalError"]('Exceed the maximum TCO stacks');
}


/***/ }),

/***/ "./src/mal/init-repl-scope.ts":
/*!************************************!*\
  !*** ./src/mal/init-repl-scope.ts ***!
  \************************************/
/*! exports provided: slurp, default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "slurp", function() { return slurp; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return initReplScope; });
/* harmony import */ var is_node__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! is-node */ "./node_modules/is-node/index.js");
/* harmony import */ var is_node__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(is_node__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");
/* harmony import */ var _printer__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./printer */ "./src/mal/printer.ts");
/* harmony import */ var _reader__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./reader */ "./src/mal/reader.ts");
/* harmony import */ var _eval__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./eval */ "./src/mal/eval.ts");





const slurp = (() => {
    if (is_node__WEBPACK_IMPORTED_MODULE_0___default.a) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = __webpack_require__(/*! fs */ "fs");
        return (url) => {
            return fs.readFileSync(url, 'UTF-8');
        };
    }
    else {
        return (url) => {
            const req = new XMLHttpRequest();
            req.open('GET', url, false);
            req.send();
            if (req.status !== 200) {
                throw new _types__WEBPACK_IMPORTED_MODULE_1__["MalError"](`Failed to slurp file: ${url}`);
            }
            return req.responseText;
        };
    }
})();
function initReplScope(scope) {
    const normalizeImportURL = (() => {
        if (is_node__WEBPACK_IMPORTED_MODULE_0___default.a) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const path = __webpack_require__(/*! path */ "path");
            return (url) => {
                if (url.startsWith('.')) {
                    // Relative
                    const basepath = scope.var('*filename*').value;
                    return path.join(path.dirname(basepath), url);
                }
                else {
                    // Library
                    const basepath = scope.var('*libpath*').value;
                    return path.join(basepath, url);
                }
            };
        }
        else {
            return (url) => {
                if (url.startsWith('.')) {
                    // Relative
                    const basepath = scope.var('*filename*').value;
                    return new URL(url, basepath).href;
                }
                else {
                    // Library
                    const basepath = scope.var('*libpath*').value;
                    return new URL(url, basepath).href;
                }
            };
        }
    })();
    // Defining essential functions
    scope.def('throw', (msg) => {
        throw new _types__WEBPACK_IMPORTED_MODULE_1__["MalError"](msg.value);
    });
    // Standard Output
    scope.def('prn', (...a) => {
        _printer__WEBPACK_IMPORTED_MODULE_2__["printer"].log(...a.map(e => e.print()));
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create();
    });
    scope.def('print-str', (...a) => {
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalString"].create(a.map(e => e.print()).join(' '));
    });
    scope.def('println', (...a) => {
        _printer__WEBPACK_IMPORTED_MODULE_2__["printer"].log(...a.map(e => e.print(false)));
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create();
    });
    scope.def('clear', () => {
        _printer__WEBPACK_IMPORTED_MODULE_2__["printer"].clear();
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create();
    });
    // I/O
    scope.def('read-string', (x) => Object(_reader__WEBPACK_IMPORTED_MODULE_3__["default"])(x.value));
    scope.def('slurp', (x) => _types__WEBPACK_IMPORTED_MODULE_1__["MalString"].create(slurp(x.value)));
    // // Interop
    scope.def('js-eval', (x) => Object(_reader__WEBPACK_IMPORTED_MODULE_3__["jsToMal"])(eval(x.value.toString())));
    scope.def('*is-node*', is_node__WEBPACK_IMPORTED_MODULE_0___default.a);
    scope.def('*host-language*', 'JavaScript');
    scope.def('normalize-import-url', (url) => {
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalString"].create(normalizeImportURL(url.value));
    });
    scope.def('eval', (exp) => {
        return Object(_eval__WEBPACK_IMPORTED_MODULE_4__["default"])(exp, scope.env);
    });
    let filename, libpath;
    if (is_node__WEBPACK_IMPORTED_MODULE_0___default.a) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = __webpack_require__(/*! path */ "path");
        filename = __filename;
        libpath = path.join(path.dirname(__filename), './lib');
    }
    else {
        filename = new URL('.', document.baseURI).href;
        libpath = new URL('./lib/', document.baseURI).href;
    }
    scope.def('*filename*', filename);
    scope.def('*libpath*', libpath);
    scope.def('import-force', (url) => {
        let _url = url.value;
        // Append .glisp if there's no extension
        if (!/\.[a-za-z]+$/.test(_url)) {
            _url += '.glisp';
        }
        const pwd = scope.var('*filename*');
        const absurl = normalizeImportURL(_url);
        const text = slurp(absurl);
        let exp;
        if (_url.endsWith('.js')) {
            eval(text);
            exp = globalThis['glisp_library'];
        }
        else {
            exp = Object(_reader__WEBPACK_IMPORTED_MODULE_3__["default"])(`(do ${text}\nnil)`);
        }
        scope.def('*filename*', absurl);
        scope.eval(exp);
        scope.def('*filename*', pwd);
        return _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create();
    });
    // Load core library as default
    scope.REP('(import-force "core")');
    // Set the current filename to pwd
    if (is_node__WEBPACK_IMPORTED_MODULE_0___default.a) {
        scope.def('*filename*', process.cwd());
    }
}


/***/ }),

/***/ "./src/mal/printer.ts":
/*!****************************!*\
  !*** ./src/mal/printer.ts ***!
  \****************************/
/*! exports provided: printer, default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "printer", function() { return printer; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return printExp; });
const printer = {
    log: (...args) => {
        console.info(...args);
    },
    return: (...args) => {
        console.log(...args);
    },
    error: (...args) => {
        console.error(...args);
    },
    pseudoExecute: (command) => {
        console.log(command);
    },
    clear: console.clear,
};
function printExp(exp) {
    return exp.print();
}


/***/ }),

/***/ "./src/mal/reader.ts":
/*!***************************!*\
  !*** ./src/mal/reader.ts ***!
  \***************************/
/*! exports provided: MalBlankException, MalReadError, default, jsToMal, reconstructTree */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalBlankException", function() { return MalBlankException; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalReadError", function() { return MalReadError; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return readStr; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "jsToMal", function() { return jsToMal; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "reconstructTree", function() { return reconstructTree; });
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");

class MalBlankException extends _types__WEBPACK_IMPORTED_MODULE_0__["MalError"] {
}
class MalReadError extends _types__WEBPACK_IMPORTED_MODULE_0__["MalError"] {
}
class Reader {
    constructor(tokens, str) {
        this.tokens = tokens;
        this.str = str;
        this.strlen = str.length;
        this._index = 0;
    }
    next() {
        const token = this.tokens[this._index++];
        return token[0];
    }
    peek(pos = this._index) {
        const token = this.tokens[pos];
        return token ? token[0] : '';
    }
    get index() {
        return this._index;
    }
    strInRange(start, end) {
        return this.str.slice(start, end);
    }
    offset(pos = this._index) {
        const token = this.tokens[pos];
        return token !== undefined ? token[1] : this.strlen;
    }
    endOffset(pos = this._index) {
        const token = this.tokens[pos];
        return token !== undefined ? token[1] + token[0].length : this.strlen;
    }
    prevEndOffset() {
        return this.endOffset(this._index - 1);
    }
}
function tokenize(str) {
    // eslint-disable-next-line no-useless-escape
    const re = /[\s,]*(~@|[\[\]{}()'`~^@#]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g;
    let match = null;
    const spaceRe = /^[\s,]*/;
    let spaceMatch = null, spaceOffset = null;
    const results = [];
    while ((match = re.exec(str)) && match[1] != '') {
        if (match[1][0] === ';') {
            continue;
        }
        spaceMatch = spaceRe.exec(match[0]);
        spaceOffset = spaceMatch ? spaceMatch[0].length : 0;
        results.push([match[1], match.index + spaceOffset]);
    }
    return results;
}
function readAtom(reader) {
    const token = reader.next();
    if (typeof token === 'string') {
        if (token.match(/^[-+]?[0-9]+$/)) {
            // integer
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalNumber"].create(parseInt(token, 10));
        }
        else if (token.match(/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/)) {
            // float
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalNumber"].create(parseFloat(token));
        }
        else if (token.match(/^"(?:\\.|[^\\"])*"$/)) {
            // string
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalString"].create(token
                .slice(1, token.length - 1)
                .replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c)) // handle new line
            );
        }
        else if (token[0] === '"') {
            throw new MalReadError("Expected '\"', got EOF");
        }
        else if (token[0] === ':') {
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalKeyword"].create(token.slice(1));
        }
        else if (token === 'nil') {
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
        }
        else if (token === 'true') {
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalBoolean"].create(true);
        }
        else if (token === 'false') {
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalBoolean"].create(false);
        }
        else if (/^NaN$|^-?Infinity$/.test(token)) {
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalNumber"].create(parseFloat(token));
        }
        else {
            // symbol
            return _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create(token);
        }
    }
    else {
        return token;
    }
}
// read list of tokens
function readColl(reader, start = '[', end = ']') {
    const coll = [];
    const delimiters = [];
    let token = reader.next();
    if (token !== start) {
        throw new MalReadError(`Expected '${start}'`);
    }
    while ((token = reader.peek()) !== end) {
        if (!token) {
            throw new MalReadError(`Expected '${end}', got EOF`);
        }
        // Save delimiter
        const delimiter = reader.strInRange(reader.prevEndOffset(), reader.offset());
        delimiters === null || delimiters === void 0 ? void 0 : delimiters.push(delimiter);
        coll.push(readForm(reader));
    }
    // Save a delimiter between a last element and a end tag
    const delimiter = reader.strInRange(reader.prevEndOffset(), reader.offset());
    delimiters.push(delimiter);
    reader.next();
    return {
        coll,
        delimiters,
    };
}
// read vector of tokens
function readVector(reader) {
    const { coll, delimiters } = readColl(reader, '[', ']');
    const vec = _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(coll);
    vec.delimiters = delimiters;
    return vec;
}
function readList(reader) {
    const { coll, delimiters } = readColl(reader, '(', ')');
    const list = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create(coll);
    list.delimiters = delimiters;
    return list;
}
// read hash-map key/value pairs
function readMap(reader) {
    const { coll, delimiters } = readColl(reader, '{', '}');
    const map = _types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].fromSeq(coll);
    map.delimiters = delimiters;
    return map;
}
function readForm(reader) {
    let val;
    // For syntaxtic sugars
    // const startIdx = reader.index
    // Set offset array value if the form is syntaxic sugar.
    // the offset array is like [<end of arg0>, <start of arg1>]
    let sugar = null;
    const token = reader.peek();
    switch (token) {
        // reader macros/transforms
        case ';':
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
            break;
        case "'":
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('quote'), readForm(reader)]);
            break;
        case '`':
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('quasiquote'), readForm(reader)]);
            break;
        case '~':
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('unquote'), readForm(reader)]);
            break;
        case '~@':
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([
                _types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('splice-unquote'),
                readForm(reader),
            ]);
            break;
        case '#': {
            reader.next();
            const type = reader.peek();
            if (type === '(') {
                // Syntactic sugar for anonymous function: #( )
                sugar = [reader.prevEndOffset(), reader.offset()];
                val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('fn-sugar'), readForm(reader)]);
            }
            else {
                throw new Error('Invalid # syntactic sugar');
            }
            break;
        }
        case '^': {
            // Syntactic sugar for with-meta
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            const meta = readForm(reader);
            sugar.push(reader.prevEndOffset(), reader.offset());
            const expr = readForm(reader);
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('with-meta-sugar'), meta, expr]);
            break;
        }
        case '@':
            // Syntactic sugar for deref
            reader.next();
            sugar = [reader.prevEndOffset(), reader.offset()];
            val = _types__WEBPACK_IMPORTED_MODULE_0__["MalList"].create([_types__WEBPACK_IMPORTED_MODULE_0__["MalSymbol"].create('deref'), readForm(reader)]);
            break;
        // list
        case ')':
            throw new MalReadError("unexpected ')'");
        case '(':
            val = readList(reader);
            break;
        // vector
        case ']':
            throw new Error("unexpected ']'");
        case '[':
            val = readVector(reader);
            break;
        // hash-map
        case '}':
            throw new Error("unexpected '}'");
        case '{':
            val = readMap(reader);
            break;
        // atom
        default:
            val = readAtom(reader);
    }
    if (sugar) {
        const _val = val;
        // Save str info
        const formEnd = reader.prevEndOffset();
        _val.sugar = token;
        const delimiters = [''];
        sugar.push(formEnd);
        for (let i = 0; i < sugar.length - 1; i += 2) {
            delimiters.push(reader.strInRange(sugar[i], sugar[i + 1]));
        }
        delimiters.push('');
        _val.delimiters = delimiters;
    }
    return val;
}
function readStr(str) {
    const tokens = tokenize(str);
    if (tokens.length === 0) {
        throw new MalBlankException();
    }
    const reader = new Reader(tokens, str);
    const exp = readForm(reader);
    if (reader.index < tokens.length - 1) {
        throw new MalReadError('Invalid end of file');
    }
    reconstructTree(exp);
    return exp;
}
function jsToMal(obj) {
    if (Object(_types__WEBPACK_IMPORTED_MODULE_0__["isMal"])(obj)) {
        // MalVal
        return obj;
    }
    else if (Array.isArray(obj)) {
        // Vector
        return _types__WEBPACK_IMPORTED_MODULE_0__["MalVector"].create(obj.map(jsToMal));
    }
    else if (obj instanceof Function) {
        // Function
        return _types__WEBPACK_IMPORTED_MODULE_0__["MalFn"].create(obj);
    }
    else if (obj instanceof Object) {
        // Map
        const ret = {};
        for (const [key, value] of Object.entries(obj)) {
            ret[key] = jsToMal(value);
        }
        return _types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].create(ret);
    }
    else if (obj === null || obj === undefined) {
        // Nil
        return _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
    }
    else {
        switch (typeof obj) {
            case 'number':
                return _types__WEBPACK_IMPORTED_MODULE_0__["MalNumber"].create(obj);
            case 'string':
                return _types__WEBPACK_IMPORTED_MODULE_0__["MalString"].create(obj);
            case 'boolean':
                return _types__WEBPACK_IMPORTED_MODULE_0__["MalBoolean"].create(obj);
            default:
                return _types__WEBPACK_IMPORTED_MODULE_0__["MalNil"].create();
        }
    }
}
function reconstructTree(exp) {
    seek(exp);
    function seek(exp, parent) {
        if (parent) {
            exp.parent = parent;
        }
        if (Object(_types__WEBPACK_IMPORTED_MODULE_0__["isMalSeq"])(exp)) {
            exp.value.forEach((child, index) => seek(child, { ref: exp, index }));
        }
        else if (_types__WEBPACK_IMPORTED_MODULE_0__["MalMap"].is(exp)) {
            exp
                .entries()
                .forEach(([, child], index) => seek(child, { ref: exp, index }));
        }
    }
}


/***/ }),

/***/ "./src/mal/scope.ts":
/*!**************************!*\
  !*** ./src/mal/scope.ts ***!
  \**************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return Scope; });
/* harmony import */ var _env__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./env */ "./src/mal/env.ts");
/* harmony import */ var _reader__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./reader */ "./src/mal/reader.ts");
/* harmony import */ var _eval__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./eval */ "./src/mal/eval.ts");
/* harmony import */ var _init_repl_scope__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./init-repl-scope */ "./src/mal/init-repl-scope.ts");
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");
/* harmony import */ var _printer__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./printer */ "./src/mal/printer.ts");






class Scope {
    constructor(outer = null, name = 'repl', onSetup = null) {
        this.outer = outer;
        this.name = name;
        this.onSetup = onSetup;
        this.setup();
        if (this.outer === null) {
            this.initAsRepl();
        }
        else {
            this.outer.inner = this;
        }
    }
    setup(option) {
        var _a;
        this.env = new _env__WEBPACK_IMPORTED_MODULE_0__["default"]({ outer: (_a = this.outer) === null || _a === void 0 ? void 0 : _a.env, name: this.name });
        if (this.onSetup && option) {
            this.onSetup(this, option);
        }
        if (this.inner) {
            this.inner.env.outer = this.env;
        }
    }
    REP(str) {
        const ret = this.readEval(str);
        if (ret !== undefined) {
            _printer__WEBPACK_IMPORTED_MODULE_5__["printer"].return(ret.print());
        }
    }
    readEval(str) {
        try {
            return this.eval(Object(_reader__WEBPACK_IMPORTED_MODULE_1__["default"])(str));
        }
        catch (err) {
            if (err instanceof _reader__WEBPACK_IMPORTED_MODULE_1__["MalBlankException"]) {
                return _types__WEBPACK_IMPORTED_MODULE_4__["MalNil"].create();
            }
            if (err instanceof _types__WEBPACK_IMPORTED_MODULE_4__["MalError"]) {
                _printer__WEBPACK_IMPORTED_MODULE_5__["printer"].error(err);
            }
            else {
                _printer__WEBPACK_IMPORTED_MODULE_5__["printer"].error(err.stack);
            }
            return undefined;
        }
    }
    eval(exp) {
        try {
            return Object(_eval__WEBPACK_IMPORTED_MODULE_2__["default"])(exp, this.env);
        }
        catch (err) {
            if (err instanceof _types__WEBPACK_IMPORTED_MODULE_4__["MalError"]) {
                _printer__WEBPACK_IMPORTED_MODULE_5__["printer"].error(err);
            }
            else {
                _printer__WEBPACK_IMPORTED_MODULE_5__["printer"].error(err.stack);
            }
            return undefined;
        }
    }
    def(name, value) {
        this.env.set(name, Object(_reader__WEBPACK_IMPORTED_MODULE_1__["jsToMal"])(value));
    }
    pushBinding(env) {
        this.env.pushBinding(env);
    }
    popBinding() {
        this.env.popBinding();
    }
    var(name) {
        return this.env.get(name);
    }
    initAsRepl() {
        Object(_init_repl_scope__WEBPACK_IMPORTED_MODULE_3__["default"])(this);
    }
}


/***/ }),

/***/ "./src/mal/special-forms-meta.ts":
/*!***************************************!*\
  !*** ./src/mal/special-forms-meta.ts ***!
  \***************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _reader__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./reader */ "./src/mal/reader.ts");
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./types */ "./src/mal/types.ts");


/* harmony default export */ __webpack_exports__["default"] = ({
    def: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Defines a variable',
        params: [
            { label: 'Symbol', type: 'symbol' },
            { label: 'Value', type: 'any' },
        ],
    })),
    defvar: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Creates a variable which can be changed by the bidirectional evaluation',
        params: [
            { label: 'Symbol', type: 'symbol' },
            { label: 'Value', type: 'any' },
        ],
    })),
    let: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Creates a lexical scope',
        params: [
            { label: 'Binds', type: 'exp' },
            { label: 'Body', type: 'exp' },
        ],
    })),
    binding: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Creates a new binding',
        params: [
            { label: 'Binds', type: 'exp' },
            { label: 'Body', type: 'exp' },
        ],
    })),
    'get-all-symbols': _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Gets all existing symbols',
        params: [],
        return: { type: 'vector' },
    })),
    'fn-params': _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Gets the list of a function parameter',
        params: [{ label: 'Function', type: 'symbol' }],
    })),
    'eval*': _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally',
        params: [{ label: 'Form', type: 'exp' }],
    })),
    quote: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Yields the unevaluated *form*',
        params: [{ label: 'Form', type: 'exp' }],
    })),
    quasiquote: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Quasiquote',
        params: [{ label: 'Form', type: 'exp' }],
    })),
    fn: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Defines a function',
        params: [
            { label: 'Params', type: 'exp' },
            { label: 'Form', type: 'exp' },
        ],
    })),
    'fn-sugar': _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'syntactic sugar for (fn [] *form*)',
        params: [],
    })),
    macro: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: '',
        params: [
            { label: 'Param', type: 'exp' },
            { label: 'Form', type: 'exp' },
        ],
    })),
    macroexpand: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Expands the macro',
        params: [],
    })),
    try: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Try',
        params: [],
    })),
    catch: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Catch',
        params: [],
    })),
    do: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Evaluates *forms* in order and returns the value of the last',
        params: [
            {
                type: 'vector',
                variadic: true,
                items: { label: 'Form', type: 'any' },
            },
        ],
    })),
    if: _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'If statement. If **else** is not supplied it defaults to nil',
        params: [
            { label: 'Test', type: 'boolean' },
            { label: 'Then', type: 'exp' },
            { label: 'Else', type: 'exp', default: null },
        ],
    })),
    'env-chain': _types__WEBPACK_IMPORTED_MODULE_1__["MalFn"].create(() => _types__WEBPACK_IMPORTED_MODULE_1__["MalNil"].create()).withMeta(Object(_reader__WEBPACK_IMPORTED_MODULE_0__["jsToMal"])({
        doc: 'Env chain',
        params: [],
    })),
});


/***/ }),

/***/ "./src/mal/types.ts":
/*!**************************!*\
  !*** ./src/mal/types.ts ***!
  \**************************/
/*! exports provided: MalType, MalNumber, MalString, MalBoolean, MalKeyword, MalNil, MalSymbol, MalList, MalVector, MalMap, MalFn, MalMacro, MalAtom, MalError, isMal, isMalColl, isMalSeq */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalType", function() { return MalType; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalNumber", function() { return MalNumber; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalString", function() { return MalString; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalBoolean", function() { return MalBoolean; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalKeyword", function() { return MalKeyword; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalNil", function() { return MalNil; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalSymbol", function() { return MalSymbol; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalList", function() { return MalList; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalVector", function() { return MalVector; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalMap", function() { return MalMap; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalFn", function() { return MalFn; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalMacro", function() { return MalMacro; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalAtom", function() { return MalAtom; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MalError", function() { return MalError; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isMal", function() { return isMal; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isMalColl", function() { return isMalColl; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isMalSeq", function() { return isMalSeq; });
var MalType;
(function (MalType) {
    MalType["Number"] = "number";
    MalType["String"] = "string";
    MalType["Boolean"] = "boolean";
    MalType["Symbol"] = "symbol";
    MalType["Keyword"] = "keyword";
    MalType["Nil"] = "nil";
    MalType["List"] = "list";
    MalType["Vector"] = "vector";
    MalType["Map"] = "map";
    MalType["Fn"] = "fn";
    MalType["Macro"] = "macro";
    MalType["Atom"] = "atom";
})(MalType || (MalType = {}));
class MalBase {
    constructor(value, meta) {
        this._value = value;
        if (meta) {
            this._meta = meta;
        }
    }
    withMeta(meta) {
        const v = this.clone();
        switch (meta.type) {
            case MalType.Nil:
                break;
            case MalType.Map:
                v._meta = meta;
                break;
            case MalType.Keyword:
            case MalType.String:
                v._meta = MalMap.fromSeq([meta, MalBoolean.create(true)]);
                break;
            default:
                throw new Error('Metadata must be Symbol, Keyword, String or Map');
        }
        return v;
    }
    get meta() {
        return this._meta ? this._meta : (this._meta = MalNil.create());
    }
    get value() {
        return this._value;
    }
    set evaluated(_) {
        undefined;
    }
    get evaluated() {
        return this;
    }
}
// Primitives
class MalPrimBase extends MalBase {
    equals(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === this.type && v.value === this._value;
    }
}
class MalNumber extends MalPrimBase {
    constructor(v, meta) {
        super(v, meta);
        this.type = MalType.Number;
        if (typeof v !== 'number')
            throw new Error();
    }
    print() {
        return this._value.toFixed(4).replace(/\.?[0]+$/, '');
    }
    clone() {
        return new MalNumber(this._value);
    }
    toJS() {
        return this._value;
    }
    static create(v = 0) {
        return new this(v);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Number;
    }
}
class MalString extends MalPrimBase {
    constructor(v, meta) {
        super(v, meta);
        this.type = MalType.String;
        if (typeof v !== 'string')
            throw new Error();
    }
    get(index) {
        return new MalString(this._value[index]);
    }
    print(readably = true) {
        return readably
            ? '"' +
                this._value
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n') +
                '"'
            : this._value;
    }
    clone() {
        var _a;
        return new MalString(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return this._value;
    }
    get count() {
        return this._value.length;
    }
    static create(v = '') {
        return new this(v);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.String;
    }
}
class MalBoolean extends MalPrimBase {
    constructor(v, meta) {
        super(!!v, meta);
        this.type = MalType.Boolean;
    }
    print() {
        return this._value ? 'true' : 'false';
    }
    clone() {
        var _a;
        return new MalBoolean(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return this._value;
    }
    static create(v = true) {
        return new this(v);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Boolean;
    }
}
class MalKeyword extends MalPrimBase {
    constructor(v, meta) {
        super(v, meta);
        this.type = MalType.Keyword;
        if (typeof v !== 'string')
            throw new Error();
    }
    print() {
        return ':' + this._value;
    }
    clone() {
        var _a;
        return new MalKeyword(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return this._value;
    }
    static create(v = '_') {
        return new this(v);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Keyword;
    }
    static isFor(v, name) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Keyword && v.value === name;
    }
}
class MalNil extends MalPrimBase {
    constructor(_, meta) {
        super(null, meta);
        this.type = MalType.Nil;
    }
    print() {
        return 'nil';
    }
    clone() {
        var _a;
        return new MalNil(null, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return null;
    }
    static create() {
        return new this(null);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Nil;
    }
}
class MalSymbol extends MalPrimBase {
    constructor(v, meta) {
        super(v, meta);
        this.type = MalType.Symbol;
        if (typeof v !== 'string')
            throw new Error();
    }
    set evaluated(v) {
        this._evaluated = v;
    }
    get evaluated() {
        return this._evaluated || this;
    }
    print() {
        return this._value;
    }
    clone() {
        var _a;
        return new MalSymbol(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return this._value;
    }
    static create(v = '_') {
        return new this(v);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Symbol;
    }
    static isFor(v, name) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Symbol && v.value === name;
    }
}
class MalCollBase extends MalBase {
    set evaluated(v) {
        this._evaluated = v;
    }
    get evaluated() {
        return this._evaluated || this;
    }
}
class MalSeqBase extends MalCollBase {
    set delimiters(v) {
        this._delimiters = v;
    }
    get delimiters() {
        if (!this._delimiters) {
            this._delimiters =
                this._value.length === 0
                    ? ['']
                    : ['', ...Array(this._value.length - 1).fill(' '), ''];
        }
        return this._delimiters;
    }
    printValues(readably) {
        const delimiters = this.delimiters;
        let str = delimiters[0];
        for (let i = 0; i < this._value.length; i++) {
            str += this._value[i].print(readably) + delimiters[i + 1];
        }
        return str;
    }
    toJS() {
        this._value.map(x => x.toJS());
    }
    equals(v) {
        return (v.type === this.type &&
            v.value.length === this._value.length &&
            v.value.every((x, i) => x.equals(this._value[i])));
    }
    // Inherited from MalCollBase
    get(index) {
        return this._value[index];
    }
    get count() {
        return this._value.length;
    }
}
class MalList extends MalSeqBase {
    constructor() {
        super(...arguments);
        this.type = MalType.List;
    }
    print(readably = true) {
        return '(' + this.printValues(readably) + ')';
    }
    clone(deep = false) {
        var _a;
        const value = deep ? this._value.map(v => v.clone(true)) : [...this._value];
        return new MalList(value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    // Original methods
    get first() {
        return this._value[0] || MalNil.create();
    }
    get rest() {
        return this._value.slice(1);
    }
    // Static functions
    static create(v = []) {
        return new this(v);
    }
    static fromSeq(...xs) {
        return new this(xs);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.List;
    }
    static isCallOf(v, name) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.List && MalSymbol.isFor(v.first, name);
    }
}
class MalVector extends MalSeqBase {
    constructor() {
        super(...arguments);
        this.type = MalType.Vector;
    }
    print(readably = true) {
        return '[' + this.printValues(readably) + ']';
    }
    clone(deep = false) {
        var _a;
        const value = deep ? this._value.map(v => v.clone(true)) : [...this._value];
        return new MalVector(value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    // Static functions
    static create(v = []) {
        return new this(v);
    }
    static fromSeq(...xs) {
        return new this(xs);
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Vector;
    }
}
class MalMap extends MalCollBase {
    constructor() {
        super(...arguments);
        this.type = MalType.Map;
    }
    print(readably = true) {
        const entries = this.entries();
        const delimiters = this.delimiters;
        let str = '';
        for (let i = 0; i < entries.length; i += 2) {
            const [k, v] = entries[i];
            str +=
                delimiters[2 * i] + `:${k}` + delimiters[2 * i + 1] + v.print(readably);
        }
        str += delimiters[delimiters.length - 1];
        return '{' + str + '}';
    }
    clone(deep = false) {
        var _a;
        const value = deep
            ? Object.fromEntries(this.entries().map(([k, v]) => [k, v.clone(true)]))
            : Object.assign({}, this._value);
        return new MalMap(value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    toJS() {
        return Object.fromEntries(Object.entries(this._value).map(([k, v]) => [k, v.toJS()]));
    }
    equals(v) {
        if (v.type !== this.type)
            return false;
        const keys = Object.keys(v.value);
        return (keys.length === this.keys().length &&
            keys.every(k => v.get(k).equals(this.get(k))));
    }
    // Inherited from MalCollBase
    set delimiters(v) {
        this._delimiters = v;
    }
    get delimiters() {
        if (!this._delimiters) {
            const count = this.count;
            this._delimiters = this._delimiters =
                count === 0 ? [''] : ['', ...Array(count * 2 - 1).fill(' '), ''];
        }
        return this._delimiters;
    }
    get(key) {
        return this._value[key];
    }
    get count() {
        return Object.keys(this._value).length;
    }
    // Original methods
    entries() {
        return Object.entries(this._value);
    }
    keys() {
        return Object.keys(this._value);
    }
    values() {
        return Object.values(this._value);
    }
    assoc(pairs) {
        return new MalMap(Object.assign(Object.assign({}, this._value), MalMap.createValue(pairs)));
    }
    // Static Functions
    static create(v) {
        return new this(v);
    }
    static fromSeq(pairs) {
        return new this(this.createValue(pairs));
    }
    static createValue(pairs) {
        const map = {};
        for (let i = 0; i < pairs.length; i += 2) {
            const k = pairs[i];
            const v = pairs[i + 1];
            if (k.type === MalType.Keyword || k.type === MalType.String) {
                map[k.value] = v;
            }
            else {
                throw new MalError(`Unexpected key ${k.print()}, expected keyword or string`);
            }
        }
        return map;
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Map;
    }
}
class MalCallable extends MalBase {
    equals(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === this.type && v.value === this._value;
    }
    print(readably = true) {
        if (this.ast) {
            return `(${this.type} ${this.ast.params.print(readably)} ${this.ast.body.print(readably)})`;
        }
        else {
            return `(${this.type} #<JS Function>)`;
        }
    }
    toJS() {
        return this._value;
    }
}
class MalFn extends MalCallable {
    constructor() {
        super(...arguments);
        this.type = MalType.Fn;
    }
    clone() {
        var _a;
        const v = new MalFn(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
        v.ast = this.ast;
        return v;
    }
    static create(v) {
        return new this(v);
    }
    static fromLisp(f, ast) {
        const v = new this(f);
        v.ast = ast;
        return v;
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Fn;
    }
}
class MalMacro extends MalCallable {
    constructor() {
        super(...arguments);
        this.type = MalType.Macro;
    }
    clone() {
        var _a;
        const v = new MalMacro(this._value, (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
        v.ast = this.ast;
        return v;
    }
    static create(v) {
        return new this(v);
    }
    static fromLisp(f, ast) {
        const v = new this(f);
        v.ast = ast;
        return v;
    }
    static is(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === MalType.Macro;
    }
}
// Atom
class MalAtom extends MalBase {
    constructor() {
        super(...arguments);
        this.type = MalType.Atom;
    }
    set evaluated(v) {
        this._evaluated = v;
    }
    get evaluated() {
        return this._evaluated || this;
    }
    clone() {
        var _a;
        return new MalAtom(this._value.clone(), (_a = this._meta) === null || _a === void 0 ? void 0 : _a.clone());
    }
    print(readably = true) {
        var _a;
        return `(atom ${(_a = this._value) === null || _a === void 0 ? void 0 : _a.print(readably)})`;
    }
    toJS() {
        return this._value.toJS();
    }
    equals(v) {
        return (v === null || v === void 0 ? void 0 : v.type) === this.type && v.value === this._value;
    }
    // Original methods
    set value(v) {
        this._value = v;
    }
    get value() {
        return this._value;
    }
    static create(value) {
        return new MalAtom(value);
    }
    static is(value) {
        return (value === null || value === void 0 ? void 0 : value.type) === MalType.Atom;
    }
}
// Errors
class MalError extends Error {
}
const isMal = (value) => {
    return typeof (value === null || value === void 0 ? void 0 : value.type) === 'string';
};
// Predicates
const isMalColl = (value) => {
    const type = value === null || value === void 0 ? void 0 : value.type;
    return (type === MalType.List || type === MalType.Map || type === MalType.Vector);
};
const isMalSeq = (value) => {
    const type = value === null || value === void 0 ? void 0 : value.type;
    return type === MalType.Vector || type === MalType.List;
};


/***/ }),

/***/ "./src/repl.ts":
/*!*********************!*\
  !*** ./src/repl.ts ***!
  \*********************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var readline_sync__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! readline-sync */ "./node_modules/readline-sync/lib/readline-sync.js");
/* harmony import */ var readline_sync__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(readline_sync__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var chalk__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! chalk */ "./node_modules/chalk/source/index.js");
/* harmony import */ var chalk__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(chalk__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mal_scope__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./mal/scope */ "./src/mal/scope.ts");
/* harmony import */ var _mal_reader__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./mal/reader */ "./src/mal/reader.ts");




const replScope = new _mal_scope__WEBPACK_IMPORTED_MODULE_2__["default"]();
if (typeof process !== 'undefined' && 2 < process.argv.length) {
    const filename = process.argv[2];
    replScope.def('*ARGV*', Object(_mal_reader__WEBPACK_IMPORTED_MODULE_3__["jsToMal"])(process.argv.slice(3)));
    replScope.def('*filename*', Object(_mal_reader__WEBPACK_IMPORTED_MODULE_3__["jsToMal"])(filename));
    replScope.REP(`(import "${filename}")`);
    process.exit(0);
}
replScope.REP(`(str "Glisp [" *host-language* "]")`);
readline_sync__WEBPACK_IMPORTED_MODULE_0___default.a.setDefaultOptions({
    prompt: {
        // Simple Object that has toString method.
        toString() {
            return chalk__WEBPACK_IMPORTED_MODULE_1___default.a.green('glisp> ');
        },
    },
});
readline_sync__WEBPACK_IMPORTED_MODULE_0___default.a.promptLoop(line => {
    try {
        replScope.REP(line);
    }
    catch (e) {
        console.error('Error:', e);
    }
    return false;
});


/***/ }),

/***/ "child_process":
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("child_process");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("crypto");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("fs");

/***/ }),

/***/ "os":
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("os");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),

/***/ "tty":
/*!**********************!*\
  !*** external "tty" ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("tty");

/***/ })

/******/ });
});
//# sourceMappingURL=index.js.map