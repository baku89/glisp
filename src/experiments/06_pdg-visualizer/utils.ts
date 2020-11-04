import cytoscape from 'cytoscape'
import klay from 'cytoscape-klay'

import {PDG, printDataType} from './repl'

cytoscape.use(klay)

export async function showPDG(
	pdg: PDG,
	el: HTMLElement = document.createElement('div')
) {
	const elements: any[] = []
	const pdgToId = new WeakMap<PDG, string>()

	let uid = 1

	async function gen(pdg: PDG): Promise<string> {
		if (pdgToId.has(pdg)) {
			return pdgToId.get(pdg) as string
		}

		const id = (uid++).toString()
		pdgToId.set(pdg, id)

		const label =
			pdg.type === 'symbol'
				? pdg.name
				: pdg.type === 'fncall'
				? pdg.fn.type === 'symbol'
					? pdg.fn.name
					: 'fn'
				: pdg.type === 'value'
				? typeof pdg.value === 'number'
					? pdg.value.toFixed(4).replace(/\.?[0]+$/, '')
					: typeof pdg.value === 'boolean'
					? pdg.value.toString()
					: printDataType(pdg.value.dataType)
				: pdg.type === 'fn'
				? 'fn'
				: '{}' // graph

		// label += ` = ${printValue(await evalPDG(pdg))}`

		const width = Math.max(24, label.length * 12 + 5) + 'px'

		const valid = pdg.type === 'value' || pdg.resolved?.result === 'succeed'

		elements.push({
			classes: [pdg.type, valid ? '' : 'invalid'].join(' '),
			data: {id, label, width},
		})

		// Add dep edges
		for (const d of pdg.dep) {
			elements.push({
				classes: 'dep',
				data: {
					source: id,
					target: await gen(d),
				},
			})
		}

		// Add Edge
		if (pdg.type === 'fncall') {
			for (let i = 0; i < pdg.params.length; i++) {
				elements.push({
					classes: 'child',
					data: {
						source: id,
						target: await gen(pdg.params[i]),
						label: i.toString(),
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
				selector: '.dep',
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

	cy.layout({
		name: 'klay',
	}).run()

	// document.body.append(el)

	return el
}
