/**
 * What an agent can do with the program on the canvas, as MCP says tools are: the dev server
 * lists them, and the canvas open from it does them (`mcpBridge`). This only says what they are.
 */

export interface McpTool {
	readonly name: string
	readonly description: string
	readonly inputSchema: {
		readonly type: 'object'
		readonly properties: Readonly<Record<string, { readonly type: string; readonly description: string; readonly [more: string]: unknown }>>
		readonly required?: readonly string[]
	}
}

const PATH = {
	type: 'string',
	description:
		'A slot path from the root: slot keys joined by "/", as read_program and slots_at list them, e.g. "binding:rect1/arg0".',
}

const none = { type: 'object', properties: {} } as const

export const MCP_TOOLS: readonly McpTool[] = [
	{
		name: 'read_program',
		description:
			'The Glisp program open on the canvas, as code, with the rows it draws and the slots at its top, each with its path, the type it expects and the type inferred for what is there.',
		inputSchema: none,
	},
	{
		name: 'slots_at',
		description: 'What is right under the slot at a path, to go into a program a level at a time, each with its path and types.',
		inputSchema: { type: 'object', properties: { path: PATH }, required: ['path'] },
	},
	{
		name: 'type_at',
		description:
			'The type the slot at a path expects, the type inferred for what is written there (without evaluating it), and whether that fits.',
		inputSchema: { type: 'object', properties: { path: PATH }, required: ['path'] },
	},
	{
		name: 'signature',
		description: 'How a function is called: its parameters and their types, what it returns, and its doc.',
		inputSchema: {
			type: 'object',
			properties: { name: { type: 'string', description: 'As it is written, e.g. "path.circle" or "vec2.reflect".' } },
			required: ['name'],
		},
	},
	{
		name: 'check',
		description: 'What is wrong with the program, as checking it says, without running it.',
		inputSchema: none,
	},
	{
		name: 'edit_at',
		description:
			'Write Glisp code in place of what is at a path. It is one step to undo on the canvas. Returns the problems the program has after.',
		inputSchema: {
			type: 'object',
			properties: { path: PATH, code: { type: 'string', description: 'Glisp code for that slot.' } },
			required: ['path', 'code'],
		},
	},
	{
		name: 'write_program',
		description:
			'Replace the whole program with Glisp code: a block {…}, or what it draws as [name = (…) …]. It is one step to undo on the canvas.',
		inputSchema: {
			type: 'object',
			properties: { code: { type: 'string', description: 'The whole program.' } },
			required: ['code'],
		},
	},
	{
		name: 'get_selection',
		description:
			'What is selected on the canvas, in the order it was selected, each as its path, its code in full and its inferred type; and under "chosen", the parts picked within it, as the points chosen with the Edit Points tool are, which is what quick-add and apply go by first.',
		inputSchema: none,
	},
	{
		name: 'refer',
		description:
			'Have what is at one path refer to what is at another, by name if it can or else by a relative path, so that it goes on being that as the other changes, rather than a copy of its value. One step to undo.',
		inputSchema: {
			type: 'object',
			properties: {
				source: { ...PATH, description: `Where the reference is written. ${PATH.description}` },
				target: { ...PATH, description: `What it refers to. ${PATH.description}` },
			},
			required: ['source', 'target'],
		},
	},
	{
		name: 'apply',
		description:
			'Call a function on what is selected, as quick-add on the canvas does. Each selected path goes into the first argument left of its type (of several of a type, the one listed first comes first; where the rest are listed does not matter). With every argument that some of them could be given, one more that is of what the function returns is where the call is written, in place of what was there: e.g. two points and a line with vec2.reflect make the point listed last the mirror image of the other. Otherwise it is a new row. One step to undo.',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'The function, as written, e.g. "vec2.reflect" or "path.circle".' },
				selected: {
					type: 'array',
					items: { type: 'string' },
					description: 'Paths to give it, in order. Leave it out for what is selected on the canvas.',
				},
				at: {
					type: 'array',
					items: { type: 'number' },
					description: 'Where a new shape goes around, as [x y]. [0 0] if left out.',
				},
			},
			required: ['name'],
		},
	},
	{
		name: 'render',
		description:
			'What the program draws: as a PNG image to look at (default), drawn from its SVG, or as the SVG text.',
		inputSchema: {
			type: 'object',
			properties: {
				format: { type: 'string', enum: ['png', 'svg'], description: '"png" (default) or "svg".' },
				width: { type: 'number', description: 'How wide a PNG is, in pixels. 800 if left out.' },
			},
		},
	},
]
