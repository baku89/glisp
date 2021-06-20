export interface BrushDefinition {
	label: string
	icon: string
	frag: string
	params: {
		[name: string]:
			| {type: 'slider'; default?: number; min?: number; max?: number}
			| {type: 'angle'; default?: number}
			| {type: 'color'; default?: string}
			| {type: 'seed'}
	}
}
