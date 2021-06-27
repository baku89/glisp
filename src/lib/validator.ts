import {flow} from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import _ from 'lodash'

import {Validator} from './fp'
import {generateUniqueKey} from './string'

export const validateNonWhitespace: Validator<string> = value => {
	const trimmed = value.trim()
	return trimmed === '' ? O.none : O.some(value)
}

export const validateAlphanumericIdentifier: Validator<string> = value => {
	const validated = value
		.trim()
		.replaceAll(/[\s]/g, '_')
		.replaceAll(/[^a-z0-9_]/gi, '')
	return validated !== '' ? O.some(validated) : O.none
}

export const generateUniqueKeyValidator = (
	keys: string[],
	separator = ''
): Validator<string> => {
	return flow(_.partial(generateUniqueKey, _, keys, separator), O.some)
}
