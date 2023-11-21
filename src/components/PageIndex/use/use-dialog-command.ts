import {printExp} from '@/mal'
import {printer} from '@/mal/printer'
import {
	getMeta,
	isFunc,
	isSymbol,
	MalError,
	MalFunc,
	MalMap,
	MalType,
	MalVal,
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'
import ConsoleScope from '@/scopes/console'

export default function useDialogCommand() {
	// const {$modal} = context.root

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

		// Create the expression with default parameters
		// const exp: MalVal = L(f, ...initialParams)

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
