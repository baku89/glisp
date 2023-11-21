import {GlispError} from './types'
import {convertJSObjectToExprMap} from './utils'

export default {
	resolveJS(str: string): [any, any] {
		if (str.match(/\./)) {
			// eslint-disable-next-line no-useless-escape
			const match = /^(.*)\.[^\.]*$/.exec(str)

			if (match === null) {
				throw new GlispError('[interop.resolveJS] Cannot resolve')
			} else {
				return [eval(match[1]), eval(str)]
			}
		} else {
			return [globalThis, eval(str)]
		}
	},
	jsToExpr(obj: any) {
		if (obj === null || obj === undefined) {
			return null
		}

		return convertJSObjectToExprMap(obj)
	},
}
