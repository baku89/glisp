/**
 * The canvas doing what an agent asks of it, through the dev server's MCP server (`mcpServer.ts`):
 * it listens there for calls, does each to the program it has open, and says what came of it. Only
 * from the dev server, as a build has nothing to listen to.
 */

import type { LetAST } from '@glisp/lang'
import type { Paint, Vec } from './graphics'
import type { GlispDocument } from '@glisp/tweeq'

import {
	appliedTo,
	editedAt,
	problemsOf,
	programOf,
	readProgram,
	referredAt,
	selectionOf,
	renderedSvg,
	signatureOf,
	slotsAt,
	typeAt,
} from './hostApi'
import { withPaintAdded } from './toolAttributes'

interface Call {
	readonly id: string
	readonly tool: string
	readonly args: Readonly<Record<string, unknown>>
}

export interface CanvasForAgent {
	readonly document: GlispDocument
	/** What is selected, in the order it was. */
	selected(): readonly string[]
	/** The parts chosen within what is selected, as points are with the tool that goes by them. */
	chosen(): readonly string[]
	/** The program, now `next`, as one step to undo, with `selected` selected if it says. */
	edit(next: LetAST, selected?: readonly string[]): void
	/** What a shape that is added is painted with, as the tools paint it. */
	paint(): Paint
}

/** An image, for the dev server to give as one. */
export interface ImageResult {
	readonly image: string
	readonly mimeType: string
}

const text = (args: Call['args'], name: string): string => {
	const value = args[name]
	if (typeof value !== 'string') throw new Error(`${name} has to be a string`)
	return value
}

const paths = (args: Call['args'], name: string): readonly string[] | null => {
	const value = args[name]
	if (value === undefined) return null
	if (!Array.isArray(value) || !value.every(path => typeof path === 'string')) throw new Error(`${name} has to be a list of paths`)
	return value
}

const place = (args: Call['args'], name: string): Vec | undefined => {
	const value = args[name]
	if (value === undefined) return undefined
	if (!Array.isArray(value) || value.length !== 2 || !value.every(n => typeof n === 'number')) throw new Error(`${name} has to be [x y]`)
	return value as unknown as Vec
}

/** SVG, as a PNG `width` wide, through the page drawing it. */
async function pngOf(svg: string, width: number): Promise<ImageResult> {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
	try {
		const image = new Image()
		image.src = url
		await image.decode()
		const height = Math.max(1, Math.round((width * (image.naturalHeight || 1)) / (image.naturalWidth || 1)))
		const canvas = document.createElement('canvas')
		Object.assign(canvas, { width, height })
		const context = canvas.getContext('2d')!
		context.fillStyle = '#ffffff'
		context.fillRect(0, 0, width, height)
		context.drawImage(image, 0, 0, width, height)
		return { image: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length), mimeType: 'image/png' }
	} finally {
		URL.revokeObjectURL(url)
	}
}

/** What a call comes to, done to what the canvas has open. */
export async function doCall(canvas: CanvasForAgent, { tool, args }: Pick<Call, 'tool' | 'args'>): Promise<unknown> {
	const { document, selected, edit } = canvas
	const root = document.root.value
	const env = document.env.value
	const edited = (next: LetAST, selecting?: readonly string[]) => {
		edit(next, selecting)
		return { problems: problemsOf(document.root.value, document.env.value) }
	}
	switch (tool) {
		case 'read_program':
			return readProgram(root, env)
		case 'slots_at':
			return slotsAt(root, env, text(args, 'path'))
		case 'type_at':
			return typeAt(root, env, text(args, 'path'))
		case 'signature':
			return signatureOf(env, text(args, 'name'))
		case 'check':
			return problemsOf(root, env)
		case 'edit_at':
			return edited(editedAt(root, env, text(args, 'path'), text(args, 'code')))
		case 'write_program':
			return edited(programOf(text(args, 'code'), env))
		case 'get_selection':
			return selectionOf(root, env, selected(), canvas.chosen())
		case 'refer':
			return edited(referredAt(root, env, text(args, 'source'), text(args, 'target')))
		case 'apply': {
			// As quick-add goes by them: the parts chosen in place of what they are of.
			const parts = canvas.chosen()
			const given = [...selected().filter(row => !parts.some(part => part.startsWith(`${row}/`))), ...parts]
			const { ast, row, into } = appliedTo(root, env, text(args, 'name'), paths(args, 'selected') ?? given, place(args, 'at'))
			const next = into ? ast : withPaintAdded(ast, env, row, canvas.paint())
			return { row, into, ...edited(next, into ? undefined : [row]) }
		}
		case 'render': {
			const svg = renderedSvg(root, env)
			if (args.format === 'svg') return svg
			const width = typeof args.width === 'number' && args.width > 0 ? Math.min(4096, Math.round(args.width)) : 800
			return pngOf(svg, width)
		}
		default:
			throw new Error(`There is no tool called ${tool}`)
	}
}

async function answered(canvas: CanvasForAgent, call: Call): Promise<{ id: string; ok: boolean; result?: unknown; error?: string }> {
	try {
		return { id: call.id, ok: true, result: await doCall(canvas, call) }
	} catch (error) {
		return { id: call.id, ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}

/** Listening for calls, for as long as the page is open. What it gives stops that. */
export function listenForAgent(canvas: CanvasForAgent, base: string): () => void {
	const events = new EventSource(`${base}__mcp/tab`)
	events.addEventListener('call', event => {
		const call = JSON.parse((event as MessageEvent<string>).data) as Call
		void answered(canvas, call).then(reply =>
			fetch(`${base}__mcp/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(reply),
			})
		)
	})
	return () => events.close()
}
