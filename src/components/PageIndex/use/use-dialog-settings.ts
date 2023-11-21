import DefaultSettings from '@/default-settings.glisp?raw'
import AppScope from '@/scopes/app'
import ConsoleScope from '@/scopes/console'

export default function useDialogCommand() {
	// const {$modal} = context.root

	const settings = localStorage.getItem('settings') || DefaultSettings

	AppScope.readEval(`(do ${settings}\n)`)

	ConsoleScope.def('show-settings', () => {
		// $modal.show(
		// 	DialogSettings,
		// 	{},
		// 	{
		// 		width: 800,
		// 	}
		// )

		return null
	})
}
