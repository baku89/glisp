export interface BrushDefinition {
	label: string
	icon: string
	frag: string
	params: {
		[name: string]:
			| {type: 'slider'; default?: number; min?: number; max?: number}
			| {type: 'angle'; default?: number}
			| {type: 'seed'}
			| {type: 'color'; default?: string}
			| {type: 'checkbox'; default?: boolean}
			| {type: 'dropdown'; items: string; default?: string}
			| {type: 'cubicBezier'; default?: number[]}
	}
}
