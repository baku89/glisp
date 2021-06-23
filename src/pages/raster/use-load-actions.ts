import _ from 'lodash'
import YAML from 'yaml'

import {getTextFromGlispServer} from '@/lib/promise'
import {Store} from '@/lib/store'

import {BrushDefinition} from './brush-definition'

export default async function useLoadActions(store: Store) {
	// On Load Actions
	const url = new URL(window.location.href)
	const action = url.searchParams.get('action')
	const data = url.searchParams.get('d') || ''
	if (action) {
		switch (action) {
			case 'load_brush': {
				const result = await getTextFromGlispServer(data)
				const loadedBrush = YAML.parse(result.data) as Record<
					string,
					BrushDefinition
				>
				const [[name, brush]] = _.entries(loadedBrush)
				store.commit('viewport/addBrush', {name, brush})
				break
			}
		}

		url.searchParams.delete('action')
		url.searchParams.delete('d')

		history.pushState({}, document.title, url.toString())
	}
}
