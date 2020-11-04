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

import {
	readStr,
	readAST,
	analyzePDG,
	evalPDG,
	PDG,
	printValue,
	printDataType,
} from './repl'

async function showPDG(pdg: PDG) {
	const el = document.createElement('div')
	el.style.setProperty('width', '500px')
	el.style.setProperty('height', '250px')

	const elements: any[] = []
	const pdgToId = new WeakMap<PDG, string>()

	let uid = 1

	async function gen(pdg: PDG): Promise<string> {
		if (pdgToId.has(pdg)) {
			return pdgToId.get(pdg) as string
		}

		const id = (uid++).toString()
		pdgToId.set(pdg, id)

		let label =
			pdg.type === 'symbol'
				? pdg.name
				: pdg.type === 'fncall'
				? pdg.fn.type === 'symbol'
					? pdg.fn.name
					: 'fn'
				: pdg.type === 'value'
				? typeof pdg.value === 'number'
					? pdg.value.toFixed(4).replace(/\.?[0]+$/, '')
					: printDataType(pdg.value.dataType)
				: pdg.type === 'fn'
				? 'fn'
				: '{}' // graph

		label += ` = ${printValue(await evalPDG(pdg))}`

		const width = Math.max(24, label.length * 12 + 5) + 'px'

		const valid = pdg.type === 'value' || pdg.resolved?.result === 'succeed'

		elements.push({
			classes: [pdg.type, valid ? '' : 'invalid'].join(' '),
			data: {id, label, width},
		})

		for (const d of pdg.dup) {
			elements.push({
				classes: 'dup',
				data: {
					source: id,
					target: await gen(d),
				},
			})
		}

		// Add Edge
		if (pdg.type === 'fncall') {
			for (const p of pdg.params) {
				elements.push({
					classes: 'child',
					data: {
						source: id,
						target: await gen(p),
					},
				})
			}
		} else if (pdg.type === 'graph') {
			for (const [sym, child] of Object.entries(pdg.values)) {
				elements.push({
					classes: sym === pdg.return ? 'child' : 'graph_child',
					data: {
						source: id,
						target: await gen(child),
						label: sym,
					},
				})
			}
		} else if (pdg.type === 'symbol') {
			if (pdg.resolved?.result === 'succeed') {
				elements.push({
					classes: 'ref',
					data: {
						source: id,
						target: await gen(pdg.resolved.ref),
					},
				})
			}
		}

		return id
	}

	const out = await gen(pdg)

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
			source: '0',
			target: out,
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
					shape: 'rectangle',
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
				},
			},
			{
				selector: '.fncall',
				style: {
					'background-color': '#ba8baf',
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
					width: 2,
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
			{
				selector: '.dup',
				style: {
					'arrow-scale': 0.5,
					'line-color': '#7cafc2',
					'line-style': 'dashed',
					'target-arrow-color': '#7cafc2',
					'target-arrow-shape': 'triangle',
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
			append && append(await showPDG(pdg))
			// showPDG(pdg)
			const ret = await evalPDG(pdg)

			console.log(ret)

			return printValue(ret)
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