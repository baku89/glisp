export interface BrushDefinition {
	label: string
	icon: string
	frag: string
	parameters: {
		[name: string]:
			| {type: 'slider'; default?: number; min?: number; max?: number}
			| {type: 'color'; default?: string}
			| {type: 'seed'}
	}
}
