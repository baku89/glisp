import {SetupContext} from 'vue'
import ConsoleScope from '@/scopes/console'
import {
	MalVal,
	MalError,
	MalSymbol,
	MalMap,
	MalFunc,
	MalType,
	MalVector,
	// MalList,
} from '@/mal/types'

import {printExp} from '@/mal'
// import DialogCommand from '@/components/dialogs/DialogCommand.vue'
import {getExpByPath} from '@/mal/utils'
import {printer} from '@/mal/printer'
//
export default function useDialogCommand(context: SetupContext) {
	ConsoleScope.defn('show-command-dialog', (f: MalVal) => {
		if (f === undefined || !MalSymbol.is(f)) {
			throw new MalError(`${printExp(f)} is not a symbol`)
		}

		// Retrieve default parameters
		const fn = ConsoleScope.var(f.value)
		const meta = fn.meta
		const paramsDesc = getExpByPath(meta, 'params', MalType.Vector) as
			| MalMap[]
			| null
		let initialParams = getExpByPath(meta, 'initial-params') as
			| MalFunc
			| MalVal[]
			| null

		if (!paramsDesc || !initialParams) {
			printer.error('NO initial parmas')
			return null
		}

		if (MalFunc.is(initialParams)) {
			initialParams = initialParams.value() as MalVector
		}

		context

		// Create the expression with default parameters
		// const exp: MalVal = nonReactive(L(f, ...initialParams))

		// Show Modal
		// $modal.show(
		// 	DialogCommand,
		// 	{
		// 		exp,
		// 		fn,
		// 	},
		// 	{}
		// )

		return null
	})
}
