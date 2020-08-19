import {SetupContext} from '@vue/composition-api'
import ConsoleScope from '@/scopes/console'
import SettingsDialog from '@/components/SettingsDialog.vue'
import AppScope from '@/scopes/app'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEFAULT_SETTINGS = require('raw-loader!@/default-settings.glisp')
	.default as string

export default function useCommandDialog(context: SetupContext) {
	const {$modal} = context.root

	const settings = localStorage.getItem('settings') || DEFAULT_SETTINGS

	AppScope.readEval(`(do ${settings}\n)`)

	ConsoleScope.def('show-settings', () => {
		const code = localStorage.getItem('settings') || DEFAULT_SETTINGS

		$modal.show(
			SettingsDialog,
			{code},
			{
				width: 800,
			}
		)

		return null
	})
}
