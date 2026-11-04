import { scaledBy } from 'tweeq/InputNumber'

/** What a number says of how it is shown, as what its field takes. */
export const displayedAs = <T extends { scale?: number }>({ scale, ...rest }: T) =>
	scale === undefined ? rest : { ...rest, display: scaledBy(scale) }
