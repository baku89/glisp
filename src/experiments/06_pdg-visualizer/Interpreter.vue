<template>
	<div class="Interpreter">
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

import {readStr, readAST, analyzePDG, evalPDG, PDG} from './repl'

function showPDG(pdg: PDG) {
	const el = document.createElement('div')
	el.style.setProperty('width', '400px')
	el.style.setProperty('height', '150px')

	const elements: any[] = []
	const pdgToId = new WeakMap<PDG, string>()

	let uid = 1

	function gen(pdg: PDG): string {
		if (pdgToId.has(pdg)) {
			return pdgToId.get(pdg) as string
		}

		const id = (uid++).toString()
		pdgToId.set(pdg, id)

		const label =
			pdg.type === 'symbol' || pdg.type === 'fncall'
				? pdg.name
				: pdg.type === 'value'
				? typeof pdg.value === 'number'
					? pdg.value.toFixed(4).replace(/\.?[0]+$/, '')
					: 'fn'
				: '' // graph

		const width = Math.max(24, label.length * 12 + 5) + 'px'

		const valid = pdg.type === 'value' || pdg.resolved?.result === 'succeed'

		elements.push({
			classes: [pdg.type, valid ? '' : 'invalid'].join(' '),
			data: {id, label, width},
		})

		if (pdg.type === 'fncall') {
			const edges = pdg.params.map(p => {
				return {
					classes: 'child',
					data: {
						source: gen(p),
						target: id,
					},
				}
			})
			elements.push(...edges)
		} else if (pdg.type === 'graph') {
			const children = Object.entries(pdg.values).map(([sym, child]) => {
				return {
					classes: sym === pdg.return ? 'child' : 'graph_child',
					data: {source: gen(child), target: id, label: sym},
				}
			})

			elements.push(...children)
		} else if (pdg.type === 'symbol') {
			if (pdg.resolved?.result === 'succeed') {
				elements.push({
					classes: 'ref',
					data: {
						source: gen(pdg.resolved.ref),
						target: id,
					},
				})
			}
		}

		return id
	}

	const out = gen(pdg)

	elements.push({
		classes: 'output',
		data: {
			id: '0',
			label: '',
		},
	})
	elements.push({
		classes: 'child',
		data: {
			source: out,
			target: '0',
		},
	})

	const cy = cytoscape({
		container: el,
		elements,
		layout: {
			name: 'klay',
		},

		style: [
			// the stylesheet for the graph
			{
				selector: '*',
				style: {
					'font-size': '13px',
				},
			},
			{
				selector: 'node',
				style: {
					width: 'data(width)',
					height: '24px',
					'font-size': '13px',
					color: '#f8f8f8',
					'font-family': 'Fira Code',
					'text-valign': 'center',
					'text-halign': 'center',
					label: 'data(label)',
				} as any,
			},
			{
				selector: '.value',
				style: {
					'background-color': '#dc9656',
					shape: 'rectangle',
				},
			},
			{
				selector: '.symbol',
				style: {
					'background-color': '#86c1b9',
					shape: 'ellipse',
				},
			},
			{
				selector: '.fncall',
				style: {
					'background-color': '#ba8baf',
					shape: 'ellipse',
				},
			},
			{
				selector: '.invalid',
				style: {
					'border-color': '#ab4642',
					'border-width': 2,
				},
			},
			{
				selector: '.graph',
				style: {
					'background-color': '#b8b8b8',
					width: '18px',
					height: '18px',
				},
			},
			{
				selector: '.output',
				style: {
					'background-color': '#a1b56c',
					shape: 'star',
					width: '18px',
					height: '18px',
				},
			},
			{
				selector: 'edge',
				style: {
					width: 1,
					color: '#383838',
					'line-color': '#b8b8b8',
					'curve-style': 'bezier',
					label: 'data(label)',
				},
			},
			{
				selector: '.child',
				style: {
					'target-arrow-shape': 'triangle',
					width: 4,
				},
			},
			{
				selector: '.ref',
				style: {
					'line-style': 'dashed',
					'target-arrow-shape': 'triangle',
				},
			},
			{
				selector: '.graph_child',
				style: {
					'line-color': '#b8b8b8',
					'target-arrow-shape': 'circle',
					'arrow-scale': 0.5,
				},
			},
		],
	})

	// document.body.append(el)

	return el
}

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		let append: ((el: Element) => any) | undefined = undefined

		async function rep(str: string) {
			const pdg = analyzePDG(readAST(readStr(str)))
			append && append(showPDG(pdg))
			// showPDG(pdg)
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

.Interpreter
	app()
	padding 2rem
	height 100vh

	.__________cytoscape_container
		margin-bottom 0.5rem
		border 1px solid var(--frame)
</style>