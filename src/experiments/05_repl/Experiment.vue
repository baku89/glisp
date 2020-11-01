<template>
	<div class="Experiment">
		<MinimalConsole name="05_repl" :rep="rep" @setup="onSetupConsole" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import cytoscape from 'cytoscape'
import klay from 'cytoscape-klay'
cytoscape.use(klay)

import {defineComponent} from 'vue'
import useScheme from '@/components/use/use-scheme'
import MinimalConsole from './MinimalConsole.vue'

import {readStr, generatePDG, evalPDG, PDG} from './repl'

function showPDG(pdg: PDG) {
	const el = document.createElement('div')
	el.style.setProperty('width', '400px')
	el.style.setProperty('height', '150px')

	const elements: any[] = []
	const pdgToId = new WeakMap<PDG, string>()

	let uid = 0

	function gen(pdg: PDG): string {
		if (pdgToId.has(pdg)) {
			return pdgToId.get(pdg) as string
		}

		const id = (uid++).toString()
		pdgToId.set(pdg, id)

		const shape = pdg.type === 'node' ? 'ellipse' : 'rectangle'
		const label = pdg.type === 'node' ? pdg.symbol : pdg.value.toString()
		const color = pdg.type === 'node' ? '#ba8baf' : '#86c1b9'
		const width = Math.max(24, label.length * 12 + 5) + 'px'

		elements.push({
			data: {id, label, color, shape, width},
			classes: 'center-center',
		})

		if (pdg.type === 'node') {
			const leftId = gen(pdg.left)
			const rightId = gen(pdg.right)

			elements.push(
				{data: {source: leftId, target: id}},
				{data: {source: rightId, target: id}}
			)
		}

		return id
	}

	gen(pdg)

	const cy = cytoscape({
		container: el,
		elements,
		layout: {
			name: 'klay',
		},
		zoomingEnabled: false,
		userZoomingEnabled: false,
		style: [
			// the stylesheet for the graph
			{
				selector: 'node',
				style: {
					width: 'data(width)',
					height: '24px',
					'font-size': '13px',
					color: '#f8f8f8',
					'font-family': 'Fira Code',
					'background-color': 'data(color)',
					'text-valign': 'center',
					'text-halign': 'center',
					'text-outline-color': 'data(color)',
					'text-outline-width': 0.5,
					shape: 'data(shape)' as any,
					label: 'data(label)',
				} as any,
			},
			{
				selector: 'edge',
				style: {
					width: 1,
					'line-color': '#b8b8b8',
					'target-arrow-color': '#b8b8b8',
					'target-arrow-shape': 'triangle',
					'curve-style': 'bezier',
				},
			},
		],
	})

	cy.center()

	return el
}

export default defineComponent({
	name: 'Experiment',
	components: {MinimalConsole},
	setup() {
		useScheme()

		let append: ((el: Element) => any) | undefined = undefined

		async function rep(str: string) {
			const pdg = generatePDG(readStr(str))
			append && append(showPDG(pdg))
			const ret = await evalPDG(pdg)
			return ret.toString()
		}

		function onSetupConsole(cb: {append: (el: Element) => any}) {
			append = cb.append
		}

		return {rep, onSetupConsole}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'
@import '../../components/style/global.styl'

.Experiment
	app()
	padding 2rem
	height 100vh

	.__________cytoscape_container
		margin-bottom 0.5rem
		border 1px solid var(--frame)
</style>