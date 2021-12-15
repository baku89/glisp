/*
{
  "id": "dubins-path",
  "label": "Dubins Path",
  "icon": "ல",
  "parameters": [
    {
      "name": "strokeColor",
      "type": "color",
      "default": "#282a2e"
    },
    {
      "name": "strokeWidth",
      "type": "float",
      "default": 2
    }
  ]
}
*/

const LSL = 'LSL'
const LSR = 'LSR'
const RSL = 'RSL'
const RSR = 'RSR'
const RLR = 'RLR'
const LRL = 'LRL'

/* No error */
const RESULT_OK = Symbol('RESULT_OK')
/* Colocated configurations */
const RESULT_COCONFIGS = Symbol('RESULT_COCONFIGS')
/* Path parameterisitation error */
const RESULT_PARAM = Symbol('RESULT_PARAM')
/* the rho value is invalid */
const RESULT_BADRHO = Symbol('RESULT_BADRHO')
/* no connection between configurations with this word */
const RESULT_NOPATH = Symbol('RESULT_NOPATH')

const PIH = PI / 2

const PATH_TYPES = [LSL, LSR, RSL, RSR, RLR, LRL]

let p0, p1, tan0, tan1
let path

let circle0, circle1, circlem
let gp0, gp1, gtan0, gtan1, gh0, gh1

let radius = 11

function genCurve() {
	const theta0 = tan0.angleInRadians
	const theta1 = tan1.angleInRadians

	const dp = dubinsShortestPath(
		[p0.x, p0.y, theta0],
		[p1.x, p1.y, theta1],
		radius
	)

	if (!dp) return

	const {type, param} = dp

	const dir0 = type[0] === 'L' ? 1 : -1
	const dir1 = type[2] === 'L' ? 1 : -1

	const c0 = tan0
		.multiply(radius)
		.rotate(dir0 * 90)
		.add(p0)

	const c1 = tan1
		.multiply(radius)
		.rotate(dir1 * 90)
		.add(p1)

	const t0 = p0.rotate(degrees(dir0 * param[0]), c0)
	const t1 = p1.rotate(degrees(dir1 * -param[2]), c1)

	const t0m = p0.rotate(degrees((dir0 * param[0]) / 2), c0)
	const t1m = p1.rotate(degrees((dir1 * -param[2]) / 2), c1)

	// first
	if (path) path.remove()
	path = new Path()
	path.strokeWidth = strokeWidth
	path.strokeColor = strokeColor
	path.moveTo(p0)
	path.arcTo(t0m, t0)

	if (circle0) circle0.remove()
	circle0 = new Circle(c0, radius)
	Guide.add(circle0, 'stroke')

	// intermediate
	if (circlem) circlem.remove()
	if (type[1] === 'S') {
		path.lineTo(t1)
	} else {
		const cm = getIntersection(c0, t0, c1, t1)
		const dirm = type[1] === 'L' ? 1 : -1
		const tmm = t0.rotate(degrees((dirm * param[1]) / 2), cm)

		path.arcTo(tmm, t1)

		circlem = new Circle(cm, radius)
		Guide.add(circlem, 'stroke')
	}

	// last
	path.arcTo(t1m, p1)

	if (circle1) circle1.remove()
	circle1 = new Circle(c1, radius)
	Guide.add(circle1, 'stroke')
}

function begin() {
	tan0 = new Point(0, 1)
}

function press() {
	radius = 1
	p1 = mouse

	if (gtan0) gtan0.remove()
	if (gh0) gh0.remove()

	gp0 = gp1
	gh0 = gh1
	gtan0 = gtan1

	gtan1 = Guide.addLine(p1, p1)
	gh1 = Guide.addPoint(p1, 'stroke')
	gp1 = Guide.addPoint(p1)

	tan1 = p0 && !p0.equals(p1) ? p1.subtract(p0).normalize() : new Point(1, 0)

	if (pressCount > 1) {
		genCurve()
	}
}

function drag() {
	tan1 = mouse.subtract(p1).normalize()
	gh1.position = mouse
	gtan1.lastSegment.point = mouse

	if (pressCount === 1) {
		return
	}

	radius = Math.max(1, mouse.getDistance(p1))
	genCurve()
}

function release() {
	p0 = p1
	tan0 = tan1

	path = null

	if (circle0) circle0.remove()
	if (circle1) circle1.remove()
	if (circlem) circlem.remove()
}

//-------------------------
// dubin's curve: https://github.com/AndrewWalker/Dubins-Curves

function mod2pi(theta) {
	return ((theta % PI_2) + PI_2) % PI_2
}

function dubinsShortestPath(q0, q1, rho) {
	let path = {
		qi: null,
		param: new Array(3),
		rho: null,
		type: null,
	}

	let ir = {}
	let params = new Array(3)
	let cost
	let best_cost = Number.MAX_VALUE
	let best_word
	const errcode = dubinsIntermediateResults(ir, q0, q1, rho)
	if (errcode != RESULT_OK) {
		return null //errcode
	}

	path.qi = q0
	path.rho = rho

	PATH_TYPES.forEach(pathType => {
		let errcode = dubinsWord(ir, pathType, params)
		if (errcode === RESULT_OK) {
			cost = params[0] + params[1] + params[2]
			if (cost < best_cost) {
				best_word = pathType
				best_cost = cost
				path.param[0] = params[0]
				path.param[1] = params[1]
				path.param[2] = params[2]
				path.type = pathType
			}
		}
	})

	if (!best_word) {
		return null //RESULT_NOPATH
	}
	return path
}

function dubinsIntermediateResults(ir, q0, q1, rho) {
	let dx, dy, D, d, theta, alpha, beta
	if (rho <= 0.0) {
		return RESULT_BADRHO
	}

	dx = q1[0] - q0[0]
	dy = q1[1] - q0[1]
	D = sqrt(dx * dx + dy * dy)
	d = D / rho
	theta = 0

	/* test required to prevent domain errors if dx=0 and dy=0 */
	if (d > 0) {
		theta = mod2pi(atan2(dy, dx))
	}
	alpha = mod2pi(q0[2] - theta)
	beta = mod2pi(q1[2] - theta)

	ir.alpha = alpha
	ir.beta = beta
	ir.d = d
	ir.sa = sin(alpha)
	ir.sb = sin(beta)
	ir.ca = cos(alpha)
	ir.cb = cos(beta)
	ir.c_ab = cos(alpha - beta)
	ir.d_sq = d * d

	return RESULT_OK
}

function dubinsWord(ir, pathType, out) {
	let result
	switch (pathType) {
		case LSL:
			result = dubinsLSL(ir, out)
			break
		case RSL:
			result = dubinsRSL(ir, out)
			break
		case LSR:
			result = dubinsLSR(ir, out)
			break
		case RSR:
			result = dubinsRSR(ir, out)
			break
		case LRL:
			result = dubinsLRL(ir, out)
			break
		case RLR:
			result = dubinsRLR(ir, out)
			break
		default:
			result = RESULT_NOPATH
	}
	return result
}

function dubinsLSL(ir, out) {
	let tmp0, tmp1, p_sq

	tmp0 = ir.d + ir.sa - ir.sb
	p_sq = 2 + ir.d_sq - 2 * ir.c_ab + 2 * ir.d * (ir.sa - ir.sb)

	if (p_sq >= 0) {
		tmp1 = atan2(ir.cb - ir.ca, tmp0)
		out[0] = mod2pi(tmp1 - ir.alpha)
		out[1] = sqrt(p_sq)
		out[2] = mod2pi(ir.beta - tmp1)
		return RESULT_OK
	}
	return RESULT_NOPATH
}

function dubinsRSR(ir, out) {
	let tmp0 = ir.d - ir.sa + ir.sb
	let p_sq = 2 + ir.d_sq - 2 * ir.c_ab + 2 * ir.d * (ir.sb - ir.sa)
	if (p_sq >= 0) {
		let tmp1 = atan2(ir.ca - ir.cb, tmp0)
		out[0] = mod2pi(ir.alpha - tmp1)
		out[1] = sqrt(p_sq)
		out[2] = mod2pi(tmp1 - ir.beta)
		return RESULT_OK
	}
	return RESULT_NOPATH
}

function dubinsLSR(ir, out) {
	let p_sq = -2 + ir.d_sq + 2 * ir.c_ab + 2 * ir.d * (ir.sa + ir.sb)
	if (p_sq >= 0) {
		let p = sqrt(p_sq)
		let tmp0 = atan2(-ir.ca - ir.cb, ir.d + ir.sa + ir.sb) - atan2(-2.0, p)
		out[0] = mod2pi(tmp0 - ir.alpha)
		out[1] = p
		out[2] = mod2pi(tmp0 - mod2pi(ir.beta))
		return RESULT_OK
	}
	return RESULT_NOPATH
}

function dubinsRSL(ir, out) {
	let p_sq = -2 + ir.d_sq + 2 * ir.c_ab - 2 * ir.d * (ir.sa + ir.sb)
	if (p_sq >= 0) {
		let p = sqrt(p_sq)
		let tmp0 = atan2(ir.ca + ir.cb, ir.d - ir.sa - ir.sb) - atan2(2.0, p)
		out[0] = mod2pi(ir.alpha - tmp0)
		out[1] = p
		out[2] = mod2pi(ir.beta - tmp0)
		return RESULT_OK
	}
	return RESULT_NOPATH
}

function dubinsRLR(ir, out) {
	let tmp0 = (6 - ir.d_sq + 2 * ir.c_ab + 2 * ir.d * (ir.sa - ir.sb)) / 8
	let phi = atan2(ir.ca - ir.cb, ir.d - ir.sa + ir.sb)
	if (abs(tmp0) <= 1) {
		let p = mod2pi(PI_2 - acos(tmp0))
		let t = mod2pi(ir.alpha - phi + mod2pi(p / 2))
		out[0] = t
		out[1] = p
		out[2] = mod2pi(ir.alpha - ir.beta - t + mod2pi(p))
		return RESULT_OK
	}
	return RESULT_NOPATH
}

function dubinsLRL(ir, out) {
	let tmp0 = (6 - ir.d_sq + 2 * ir.c_ab + 2 * ir.d * (ir.sb - ir.sa)) / 8
	let phi = atan2(ir.ca - ir.cb, ir.d + ir.sa - ir.sb)
	if (abs(tmp0) <= 1) {
		let p = mod2pi(PI_2 - acos(tmp0))
		let t = mod2pi(-ir.alpha - phi + p / 2)
		out[0] = t
		out[1] = p
		out[2] = mod2pi(mod2pi(ir.beta) - ir.alpha - t + mod2pi(p))
		return RESULT_OK
	}
	return RESULT_NOPATH
}
