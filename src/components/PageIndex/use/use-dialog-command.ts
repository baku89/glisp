import {
	Expr,
	ExprFn,
	ExprMap,
	getMapValue,
	getMeta,
	GlispError,
	isFunc,
	isSymbol,
	printer,
	printExpr,
} from '@/glisp'
import ConsoleScope from '@/scopes/console'

export default function useDialogCommand() {
	// const {$modal} = context.root

	ConsoleScope.def('show-command-dialog', (f: Expr) => {
		if (f === undefined || !isSymbol(f)) {
			throw new GlispError(`${printExpr(f)} is not a symbol`)
		}

		// Retrieve default parameters
		const fn = ConsoleScope.var(f.value)
		const meta = getMeta(fn)
		const paramsDesc = getMapValue(meta, 'params', 'vector') as ExprMap[] | null
		let initialParams = getMapValue(meta, 'initial-params') as
			| ExprFn
			| Expr[]
			| null

		if (!paramsDesc || !initialParams) {
			printer.error('NO initial parmas')
			return null
		}

		if (isFunc(initialParams)) {
			initialParams = initialParams() as Expr[]
		}

		// Create the expression with default parameters
		// const exp: Expr = L(f, ...initialParams)

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
