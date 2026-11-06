/**
 * A QR code, as ISO/IEC 18004 has it: what `text` comes to as modules, dark or light, and the
 * outline of the dark ones. Text goes as bytes, in UTF-8, at the least version it fits in at
 * the level of error correction that is asked for. Which mask goes over it is the one that
 * scores least, as the standard scores them, so the same text is the same code anywhere.
 */

export type QrLevel = 'L' | 'M' | 'Q' | 'H'
export const QR_LEVELS: readonly QrLevel[] = ['L', 'M', 'Q', 'H']

type Vec = readonly [number, number]

const ORDINAL: Record<QrLevel, number> = { L: 0, M: 1, Q: 2, H: 3 }
/** What the format information says of each level. */
const FORMAT_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

// By level and then version, the first of which is not one.
const ECC_PER_BLOCK = [
	[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
	[-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]
const BLOCKS = [
	[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
	[-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
	[-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
	[-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

/** How many modules of a version are for data and error correction, and not for finding it. */
function rawModules(version: number): number {
	let result = (16 * version + 128) * version + 64
	if (version >= 2) {
		const aligns = Math.floor(version / 7) + 2
		result -= (25 * aligns - 10) * aligns - 55
		if (version >= 7) result -= 36
	}
	return result
}

const dataCodewords = (version: number, level: QrLevel): number =>
	Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[ORDINAL[level]]![version]! * BLOCKS[ORDINAL[level]]![version]!

/** Two bytes multiplied, in the field the error correction is worked out in. */
function multiply(x: number, y: number): number {
	let z = 0
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d)
		z ^= ((y >>> i) & 1) * x
	}
	return z
}

function divisorOf(degree: number): number[] {
	const result = new Array<number>(degree).fill(0)
	result[degree - 1] = 1
	let root = 1
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			result[j] = multiply(result[j]!, root)
			if (j + 1 < degree) result[j]! ^= result[j + 1]!
		}
		root = multiply(root, 0x02)
	}
	return result
}

function remainderOf(data: readonly number[], divisor: readonly number[]): number[] {
	const result = new Array<number>(divisor.length).fill(0)
	for (const byte of data) {
		const factor = byte ^ result.shift()!
		result.push(0)
		divisor.forEach((coefficient, i) => (result[i]! ^= multiply(coefficient, factor)))
	}
	return result
}

/** The codewords of `bytes` at `version`, with what corrects them, interleaved as they are placed. */
function codewordsOf(bytes: readonly number[], version: number, level: QrLevel): number[] {
	const capacity = dataCodewords(version, level)
	const bits: number[] = []
	const put = (value: number, length: number) => {
		for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
	}
	put(0b0100, 4)
	put(bytes.length, version <= 9 ? 8 : 16)
	for (const byte of bytes) put(byte, 8)
	put(0, Math.min(4, capacity * 8 - bits.length))
	put(0, (8 - (bits.length % 8)) % 8)
	for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) put(pad, 8)
	const data: number[] = []
	for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))

	const blockCount = BLOCKS[ORDINAL[level]]![version]!
	const eccLength = ECC_PER_BLOCK[ORDINAL[level]]![version]!
	const raw = Math.floor(rawModules(version) / 8)
	const shortBlocks = blockCount - (raw % blockCount)
	const shortLength = Math.floor(raw / blockCount)
	const divisor = divisorOf(eccLength)
	const blocks: number[][] = []
	for (let i = 0, k = 0; i < blockCount; i++) {
		const own = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1))
		k += own.length
		const ecc = remainderOf(own, divisor)
		if (i < shortBlocks) own.push(0)
		blocks.push([...own, ...ecc])
	}
	const result: number[] = []
	for (let i = 0; i < blocks[0]!.length; i++) {
		blocks.forEach((block, j) => {
			if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]!)
		})
	}
	return result
}

function alignmentPositions(version: number): number[] {
	if (version === 1) return []
	const count = Math.floor(version / 7) + 2
	const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
	const result = [6]
	for (let at = version * 4 + 10; result.length < count; at -= step) result.splice(1, 0, at)
	return result
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
	(x, y) => (x + y) % 2 === 0,
	(_, y) => y % 2 === 0,
	x => x % 3 === 0,
	(x, y) => (x + y) % 3 === 0,
	(x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
	(x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
	(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
	(x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

class Symbol {
	readonly size: number
	readonly dark: boolean[][]
	readonly fixed: boolean[][]

	constructor(
		readonly version: number,
		readonly level: QrLevel
	) {
		this.size = version * 4 + 17
		this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
		this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
		this.drawFunctionPatterns()
	}

	private set(x: number, y: number, dark: boolean): void {
		this.dark[y]![x] = dark
		this.fixed[y]![x] = true
	}

	private drawFunctionPatterns(): void {
		const { size } = this
		for (let i = 0; i < size; i++) {
			this.set(6, i, i % 2 === 0)
			this.set(i, 6, i % 2 === 0)
		}
		for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
			for (let dy = -4; dy <= 4; dy++) {
				for (let dx = -4; dx <= 4; dx++) {
					const [x, y] = [cx + dx, cy + dy]
					if (x < 0 || x >= size || y < 0 || y >= size) continue
					const distance = Math.max(Math.abs(dx), Math.abs(dy))
					this.set(x, y, distance !== 2 && distance !== 4)
				}
			}
		}
		const aligns = alignmentPositions(this.version)
		const last = aligns.length - 1
		aligns.forEach((cx, i) =>
			aligns.forEach((cy, j) => {
				if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
				for (let dy = -2; dy <= 2; dy++) {
					for (let dx = -2; dx <= 2; dx++) this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
				}
			})
		)
		// Where the format goes is kept for it, until it is known.
		this.drawFormat(0)
		if (this.version >= 7) {
			let remainder = this.version
			for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
			const bits = (this.version << 12) | remainder
			for (let i = 0; i < 18; i++) {
				const dark = ((bits >>> i) & 1) === 1
				const [a, b] = [size - 11 + (i % 3), Math.floor(i / 3)]
				this.set(a, b, dark)
				this.set(b, a, dark)
			}
		}
	}

	drawFormat(mask: number): void {
		const { size } = this
		const data = (FORMAT_BITS[this.level] << 3) | mask
		let remainder = data
		for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
		const bits = ((data << 10) | remainder) ^ 0x5412
		const bit = (i: number) => ((bits >>> i) & 1) === 1
		for (let i = 0; i <= 5; i++) this.set(8, i, bit(i))
		this.set(8, 7, bit(6))
		this.set(8, 8, bit(7))
		this.set(7, 8, bit(8))
		for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i))
		for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i))
		for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i))
		this.set(8, size - 8, true)
	}

	drawCodewords(data: readonly number[]): void {
		const { size } = this
		let i = 0
		for (let right = size - 1; right >= 1; right -= 2) {
			if (right === 6) right = 5
			for (let vertical = 0; vertical < size; vertical++) {
				for (let j = 0; j < 2; j++) {
					const x = right - j
					const upward = ((right + 1) & 2) === 0
					const y = upward ? size - 1 - vertical : vertical
					if (this.fixed[y]![x] || i >= data.length * 8) continue
					this.dark[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
					i++
				}
			}
		}
	}

	/** Mask `mask` over what is not fixed. Done twice, it is undone. */
	applyMask(mask: number): void {
		const masks = MASKS[mask]!
		for (let y = 0; y < this.size; y++) {
			for (let x = 0; x < this.size; x++) if (!this.fixed[y]![x] && masks(x, y)) this.dark[y]![x] = !this.dark[y]![x]
		}
	}

	/** How badly it reads, as the standard scores it: the least of the masks goes. */
	penalty(): number {
		const { size, dark } = this
		let result = 0
		const addRun = (length: number, history: number[]) => {
			if (history[0] === 0) length += size
			history.pop()
			history.unshift(length)
		}
		const finderLike = (h: readonly number[]): number => {
			const n = h[1]!
			const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n
			return (core && h[0]! >= n * 4 && h[6]! >= n ? 1 : 0) + (core && h[6]! >= n * 4 && h[0]! >= n ? 1 : 0)
		}
		const line = (at: (i: number) => boolean) => {
			let color = false
			let run = 0
			const history = [0, 0, 0, 0, 0, 0, 0]
			for (let i = 0; i < size; i++) {
				if (at(i) === color) {
					run++
					if (run === 5) result += 3
					else if (run > 5) result++
				} else {
					addRun(run, history)
					if (!color) result += finderLike(history) * 40
					color = at(i)
					run = 1
				}
			}
			if (color) {
				addRun(run, history)
				run = 0
			}
			addRun(run + size, history)
			result += finderLike(history) * 40
		}
		for (let y = 0; y < size; y++) line(x => dark[y]![x]!)
		for (let x = 0; x < size; x++) line(y => dark[y]![x]!)
		for (let y = 0; y < size - 1; y++) {
			for (let x = 0; x < size - 1; x++) {
				const c = dark[y]![x]
				if (c === dark[y]![x + 1] && c === dark[y + 1]![x] && c === dark[y + 1]![x + 1]) result += 3
			}
		}
		const darkCount = dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
		const total = size * size
		result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10
		return result
	}
}

/**
 * The modules of the QR code of `text`, by row, `true` for dark, without the quiet zone around
 * it. Null if it is too long for any version at `level`. `mask` is for saying which, as a test
 * does; otherwise it is the one that scores least.
 */
export function qrModules(text: string, level: QrLevel = 'M', mask?: number): boolean[][] | null {
	const bytes = [...new TextEncoder().encode(text)]
	let version = 1
	for (; version <= 40; version++) {
		const bits = 4 + (version <= 9 ? 8 : 16) + bytes.length * 8
		if (bits <= dataCodewords(version, level) * 8) break
	}
	if (version > 40) return null
	const symbol = new Symbol(version, level)
	symbol.drawCodewords(codewordsOf(bytes, version, level))
	let chosen = mask ?? 0
	if (mask === undefined) {
		let least = Infinity
		for (let each = 0; each < 8; each++) {
			symbol.applyMask(each)
			symbol.drawFormat(each)
			const score = symbol.penalty()
			if (score < least) [least, chosen] = [score, each]
			symbol.applyMask(each)
		}
	}
	symbol.applyMask(chosen)
	symbol.drawFormat(chosen)
	return symbol.dark
}

/**
 * The outline of the dark modules, each a loop of corners, `cell` across a module and from
 * `origin`. What is dark is on the right of where a loop goes, with y going down, so what is
 * light within is gone around the other way. Modules that only touch at a corner are apart.
 * With `everyCell`, it has a corner at each module along a side as well, and not only where
 * it turns, for each to be taken hold of: everywhere, or where it says of a corner of a module.
 */
export function qrOutline(
	modules: readonly (readonly boolean[])[],
	origin: Vec,
	cell: number,
	everyCell: boolean | ((x: number, y: number) => boolean) = false
): Vec[][] {
	const size = modules.length
	const isDark = (x: number, y: number) => x >= 0 && y >= 0 && y < size && x < size && modules[y]![x]!
	const along = typeof everyCell === 'function' ? everyCell : () => everyCell
	// Each edge of a dark module that a light one is across, keyed by where it starts.
	const from = new Map<number, number[][]>()
	const key = (x: number, y: number) => y * (size + 1) + x
	const add = (x0: number, y0: number, x1: number, y1: number) => {
		const list = from.get(key(x0, y0))
		if (list) list.push([x1, y1])
		else from.set(key(x0, y0), [[x1, y1]])
	}
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (!isDark(x, y)) continue
			if (!isDark(x, y - 1)) add(x, y, x + 1, y)
			if (!isDark(x + 1, y)) add(x + 1, y, x + 1, y + 1)
			if (!isDark(x, y + 1)) add(x + 1, y + 1, x, y + 1)
			if (!isDark(x - 1, y)) add(x, y + 1, x, y)
		}
	}
	const loops: Vec[][] = []
	for (const [startKey, ends] of from) {
		while (ends.length > 0) {
			const corners: [number, number][] = []
			let [x, y] = [startKey % (size + 1), Math.floor(startKey / (size + 1))]
			let [dx, dy] = [0, 0]
			for (;;) {
				const out = from.get(key(x, y))
				if (!out || out.length === 0) break
				// Where two meet at a corner, it turns right, for them to stay apart.
				let pick = 0
				if (out.length > 1) {
					const right = [-dy, dx]
					pick = Math.max(0, out.findIndex(([nx, ny]) => nx! - x === right[0] && ny! - y === right[1]))
				}
				const [nx, ny] = out.splice(pick, 1)[0]!
				const [ndx, ndy] = [nx! - x, ny! - y]
				if (along(x, y) || ndx !== dx || ndy !== dy) corners.push([x, y])
				;[x, y, dx, dy] = [nx!, ny!, ndx, ndy]
			}
			// Where it began may be along a side, and not a corner.
			if (corners.length > 1 && !along(corners[0]![0], corners[0]![1])) {
				const [fx, fy] = corners[0]!
				const [sx, sy] = corners[1]!
				const [lx, ly] = corners[corners.length - 1]!
				if ((fx === sx && fx === lx) || (fy === sy && fy === ly)) corners.shift()
			}
			if (corners.length >= 3) loops.push(corners.map(([cx, cy]) => [origin[0] + cx * cell, origin[1] + cy * cell] as const))
		}
	}
	return loops
}

/**
 * Whether a corner of a module, `x` and `y` across from the top left, is outside of the three
 * squares in the corners that a reader finds the code by, which are kept as squares.
 */
export const outsideFinders =
	(size: number) =>
	(x: number, y: number): boolean => {
		const near = (at: number) => at <= 7
		const far = (at: number) => at >= size - 7
		return !((near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y)))
	}
