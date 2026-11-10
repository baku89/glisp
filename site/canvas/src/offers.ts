/**
 * What something pointed at has in it that a value could refer to, where it is not itself what is
 * asked for: the places that can be snapped to on it, and its parameters, each as what it comes to.
 * A place is two numbers, and where a number is asked for, either of them is.
 */

import { type AST, CallAST, type Env, evaluate, readByName, SymAST, type TypeValue } from '@glisp/lang'
import { reach } from '@glisp/tweeq/rowsClipboard'
import { referenceAt, viewOf } from '@glisp/tweeq/structure'

import { partsOf, type Place, writtenAt } from './place'
import { placeOfSnap, sceneOf, snapPointsOf } from './scene'

/** One thing to choose: what the program comes to, chosen, or more to choose from. */
export interface Offer {
	readonly label: string
	readonly written?: AST
	readonly children?: readonly Offer[]
}

/** As far into what it is made of as it goes, for there not to be too much to choose from. */
const DEPTH = 2

const isPlace = (value: unknown): value is readonly [number, number] =>
	Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number')

/** The two numbers of a place, each as it is referred to. */
function numbersOf(place: Place): readonly [Place, Place] {
	const parts = partsOf(place)
	if (parts !== null) return [{ ast: parts[0], parts: place.parts }, { ast: parts[1], parts: place.parts }]
	// What is only referred to as a whole has them as its first and last.
	const of = (fn: string): Place => ({ ast: new CallAST(new SymAST(fn), [place.ast]), parts: place.parts })
	return [of('first'), of('last')]
}

/**
 * What can be chosen of `value`, called `label`, to go at `source` as `expected` asks: itself, if it
 * fits, or else each of its numbers, if it is a place and a number is asked for.
 */
function offerOf(
	label: string,
	value: unknown,
	expected: TypeValue,
	write: () => AST | null,
	numbers: () => readonly [AST | null, AST | null]
): Offer | null {
	if (expected.fits(value)) {
		const written = write()
		return written === null ? null : { label, written }
	}
	if (!isPlace(value) || !expected.fits(0)) return null
	const [x, y] = numbers()
	const children = [
		...(x === null ? [] : [{ label: `X  ${value[0]}`, written: x }]),
		...(y === null ? [] : [{ label: `Y  ${value[1]}`, written: y }]),
	]
	return children.length === 0 ? null : { label, children }
}

/** What there is to choose from of `row`, to go at `source`, as what is there asks for. */
export function offersOf(root: AST, env: Env, source: string, row: string, expected: TypeValue): Offer[] {
	const offers: Offer[] = []

	// The places on it that something can snap to, as they are referred to.
	const places = snapPointsOf(root, env, sceneOf(root, env).filter(shape => shape.row === row)).flatMap(snap => {
		const place = snap.to === undefined ? placeOfSnap(snap) : null
		if (place === null) return []
		const written = (at: Place) => writtenAt(root, env, source, at.ast, at.parts)
		const offer = offerOf(
			snap.label === '' ? 'point' : snap.label,
			snap.at,
			expected,
			() => written(place),
			() => numbersOf(place).map(written) as [AST | null, AST | null]
		)
		return offer === null ? [] : [offer]
	})
	if (places.length > 0) offers.push({ label: 'Snap Points', children: places })

	// What it is made of, by name, as far in as that goes.
	const slotsOf = (path: string, depth: number): Offer[] => {
		const slot = reach(root, env, path)?.chain.at(-1)
		if (slot === undefined) return []
		return viewOf(slot.ast, slot.env).slots.flatMap(inner => {
			if (inner.absent) return []
			const at = `${path}/${inner.key}`
			const label = inner.parameter ?? inner.key
			const { value } = evaluate(readByName(inner.ast), inner.env)
			const elements = (): readonly [AST | null, AST | null] => {
				const element = (i: 0 | 1) => {
					const direct = referenceAt(root, env, source, `${at}/${i}`)
					if (direct !== null) return direct
					const whole = new SymAST('__whole')
					const [x, y] = numbersOf({ ast: whole, parts: new Map([['__whole', at]]) })
					return writtenAt(root, env, source, (i === 0 ? x : y).ast, new Map([['__whole', at]]))
				}
				return [element(0), element(1)]
			}
			const offer = offerOf(label, value, expected, () => referenceAt(root, env, source, at), elements)
			const deeper = depth < DEPTH ? slotsOf(at, depth + 1) : []
			if (offer === null) return deeper.length === 0 ? [] : [{ label, children: deeper }]
			return [deeper.length === 0 || offer.children !== undefined ? offer : { label, children: [{ ...offer, label: 'itself' }, ...deeper] }]
		})
	}
	const parameters = slotsOf(row, 1)
	if (parameters.length > 0) offers.push({ label: 'Parameters', children: parameters })
	return offers
}

/** Whether anything at all can be chosen, among `offers`. */
export const hasOffer = (offers: readonly Offer[]): boolean =>
	offers.some(({ written, children }) => written !== undefined || hasOffer(children ?? []))

