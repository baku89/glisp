import {SetupContext} from 'vue'
import ConsoleScope from '@/scopes/console'
import {
	MalVal,
	MalError,
	isFunc,
	isSymbol,
	getMeta,
	MalMap,
	MalFunc,
	MalType,
	// createList as L,
} from '@/mal/types'
import {printExp} from '@/mal'
// import DialogCommand from '@/components/dialogs/DialogCommand.vue'
import {getMapValue} from '@/mal/utils'
import {printer} from '@/mal/printer'
//
export default function useDialogCommand(context: SetupContext) {
	ConsoleScope.def('show-command-dialog', (f: MalVal) => {
		if (f === undefined || !isSymbol(f)) {
			throw new MalError(`${printExp(f)} is not a symbol`)
		}

		// Retrieve default parameters
		const fn = ConsoleScope.var(f.value)
		const meta = getMeta(fn)
		const paramsDesc = getMapValue(meta, 'params', MalType.Vector) as
			| MalMap[]
			| null
		let initialParams = getMapValue(meta, 'initial-params') as
			| MalFunc
			| MalVal[]
			| null

		if (!paramsDesc || !initialParams) {
			printer.error('NO initial parmas')
			return null
		}

		if (isFunc(initialParams)) {
			initialParams = initialParams() as MalVal[]
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
