import {SetupContext} from 'vue'
import ConsoleScope from '@/scopes/console'
import DialogSettings from '@/components/dialogs/DialogSettings.vue'
import AppScope from '@/scopes/app'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEFAULT_SETTINGS = require('@/default-settings.glisp?raw')
	.default as string

export default function useDialogCommand(context: SetupContext) {
	const {$modal} = context.root

	const settings = localStorage.getItem('settings') || DEFAULT_SETTINGS

	AppScope.readEval(`(do ${settings}\n)`)

	ConsoleScope.def('show-settings', () => {
		$modal.show(
			DialogSettings,
			{},
			{
				width: 800,
			}
		)

		return null
	})
}
