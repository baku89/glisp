import {SetupContext} from 'vue'

import {MalNil} from '@/mal/types'
// import DialogSettings from '@/components/dialogs/DialogSettings.vue'
import AppScope from '@/scopes/app'
import ConsoleScope from '@/scopes/console'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEFAULT_SETTINGS = require('raw-loader!@/default-settings.glisp')
	.default as string

export default function useDialogCommand(context: SetupContext) {
	const settings = localStorage.getItem('settings') || DEFAULT_SETTINGS

	AppScope.readEval(`(do ${settings}\n)`)

	context

	ConsoleScope.defn('show-settings', () => {
		// $modal.show(
		// 	DialogSettings,
		// 	{},
		// 	{
		// 		width: 800,
		// 	}
		// )

		return MalNil.from()
	})
}
