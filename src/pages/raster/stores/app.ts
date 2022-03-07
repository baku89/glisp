import {StoreModule} from '@/lib/store'

export function useModuleApp(): StoreModule {
	return {
		state: {},
		actions: {
			reload: {
				label: 'Reload App',
				icon: '<path d="M29 16 C29 22 24 29 16 29 8 29 3 22 3 16 3 10 8 3 16 3 21 3 25 6 27 9 M20 10 L27 9 28 2" />',
				exec() {
					window.location.reload()
				},
			},
		},
	}
}
