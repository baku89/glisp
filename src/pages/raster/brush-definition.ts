export interface BrushDefinition {
	label: string
	icon: string
	frag: string
	parameters: {
		[name: string]:
			| {type: 'slider'; initial?: number; min?: number; max?: number}
			| {type: 'color'; initial?: string}
			| {type: 'seed'}
	}
}
