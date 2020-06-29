import {SetupContext} from '@vue/composition-api'
import ConsoleScope from '@/scopes/console'
import {
	MalVal,
	LispError,
	isFunc,
	isSymbol,
	getMeta,
	MalMap,
	MalFunc,
	MalType
} from '@/mal/types'
import {printExp} from '@/mal'
import CommandDialog from '@/components/CommandDialog.vue'
import {getMapValue} from '@/mal-utils'
import {printer} from '@/mal/printer'
import {NonReactive, nonReactive} from '@/utils'

export default function useCommandDialog(context: SetupContext) {
	const {$modal} = context.root

	ConsoleScope.def('show-command-dialog', (f: MalVal) => {
		if (f === undefined || !isSymbol(f)) {
			throw new LispError(`${printExp(f)} is not a symbol`)
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
		const exp: NonReactive<MalVal> = nonReactive([f, ...initialParams])

		// Show Modal
		$modal.show(
			CommandDialog,
			{
				exp,
				fn
			},
			{
				height: 'auto',
				width: 400,
				transition: 'vmodal__transition',
				overlayTransition: 'vmodal__overlay-transition'
			}
		)

		return null
	})
}
