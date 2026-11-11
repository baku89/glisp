/**
 * An MCP server on the dev server, for an agent to read and edit the program open on the canvas:
 * `claude mcp add --transport http glisp http://localhost:8126/canvas/__mcp`. It only passes each
 * call on to the canvas open from this server, which does it to what it has open, and says what
 * came of it. The canvas listens on `__mcp/tab`, and answers to `__mcp/reply`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

import { MCP_TOOLS } from './src/mcpTools'

/** How long a call waits for the canvas to answer. */
const TIMEOUT_MS = 20_000
const PROTOCOL = '2025-06-18'

interface Tab {
	readonly res: ServerResponse
	readonly since: number
}

interface JsonRpc {
	readonly jsonrpc: '2.0'
	readonly id?: string | number | null
	readonly method?: string
	readonly params?: { readonly name?: string; readonly arguments?: unknown; readonly protocolVersion?: string }
}

const bodyOf = (req: IncomingMessage): Promise<string> =>
	new Promise((resolve, reject) => {
		let text = ''
		req.setEncoding('utf8')
		req.on('data', chunk => (text += chunk))
		req.on('end', () => resolve(text))
		req.on('error', reject)
	})

const json = (res: ServerResponse, status: number, body: unknown): void => {
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(body))
}

const isImage = (value: unknown): value is { image: string; mimeType: string } =>
	typeof value === 'object' && value !== null && typeof (value as { image?: unknown }).image === 'string' && typeof (value as { mimeType?: unknown }).mimeType === 'string'

export function mcpServer(base: string): Plugin {
	const tabs = new Set<Tab>()
	const waiting = new Map<string, { resolve: (reply: { ok: boolean; result?: unknown; error?: string }) => void }>()
	let next = 0

	/** The call, done by the canvas opened last. */
	const call = (tool: string, args: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
		const tab = [...tabs].sort((a, b) => b.since - a.since)[0]
		if (tab === undefined) {
			return Promise.resolve({ ok: false, error: `No canvas is open. Open ${base} from the dev server.` })
		}
		const id = String(++next)
		return new Promise(resolve => {
			const timer = setTimeout(() => {
				waiting.delete(id)
				resolve({ ok: false, error: 'The canvas did not answer in time.' })
			}, TIMEOUT_MS)
			waiting.set(id, {
				resolve: reply => {
					clearTimeout(timer)
					resolve(reply)
				},
			})
			tab.res.write(`event: call\ndata: ${JSON.stringify({ id, tool, args })}\n\n`)
		})
	}

	const answer = async (message: JsonRpc): Promise<unknown | null> => {
		const { id = null, method, params } = message
		const result = (result: unknown) => ({ jsonrpc: '2.0', id, result })
		const error = (code: number, text: string) => ({ jsonrpc: '2.0', id, error: { code, message: text } })
		// What only tells, as `notifications/initialized` does, has nothing said back.
		if (id === null || id === undefined) return null
		switch (method) {
			case 'initialize':
				return result({
					protocolVersion: params?.protocolVersion ?? PROTOCOL,
					capabilities: { tools: {} },
					serverInfo: { name: 'glisp-canvas', version: '0.0.0' },
					instructions:
						'Tools for the Glisp program open on the canvas. Read it with read_program, go into it with slots_at, and ask what fits where with type_at and signature before editing with edit_at. Each edit is one undo step on the canvas.',
				})
			case 'ping':
				return result({})
			case 'tools/list':
				return result({ tools: MCP_TOOLS })
			case 'tools/call': {
				const name = params?.name ?? ''
				if (!MCP_TOOLS.some(tool => tool.name === name)) return error(-32602, `There is no tool called ${name}`)
				const reply = await call(name, params?.arguments ?? {})
				if (!reply.ok) return result({ content: [{ type: 'text', text: reply.error ?? 'It failed.' }], isError: true })
				const { result: value } = reply
				// What is an image, as a PNG of what is drawn is, is given as one, to be looked at.
				if (isImage(value)) return result({ content: [{ type: 'image', data: value.image, mimeType: value.mimeType }] })
				const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
				return result({ content: [{ type: 'text', text }] })
			}
			default:
				return error(-32601, `There is no method ${method}`)
		}
	}

	return {
		name: 'canvas:mcp',
		apply: 'serve',
		configureServer(server) {
			// Where the canvas listens for what it is asked to do.
			server.middlewares.use(`${base}__mcp/tab`, (req, res) => {
				res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
				res.write(': open\n\n')
				const tab = { res, since: Date.now() }
				tabs.add(tab)
				const alive = setInterval(() => res.write(': alive\n\n'), 15_000)
				req.on('close', () => {
					clearInterval(alive)
					tabs.delete(tab)
				})
			})
			server.middlewares.use(`${base}__mcp/reply`, async (req, res) => {
				if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
				const reply = JSON.parse(await bodyOf(req)) as { id: string; ok: boolean; result?: unknown; error?: string }
				waiting.get(reply.id)?.resolve(reply)
				waiting.delete(reply.id)
				json(res, 200, {})
			})
			server.middlewares.use(`${base}__mcp`, async (req, res, nextMiddleware) => {
				// What is under it is the canvas's, above.
				if ((req.url ?? '/') !== '/' && !(req.url ?? '').startsWith('/?')) return nextMiddleware()
				if (req.method !== 'POST') {
					res.writeHead(405, { Allow: 'POST' })
					return res.end()
				}
				let message: JsonRpc | JsonRpc[]
				try {
					message = JSON.parse(await bodyOf(req)) as JsonRpc | JsonRpc[]
				} catch {
					return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON' } })
				}
				const answers = (await Promise.all((Array.isArray(message) ? message : [message]).map(answer))).filter(
					reply => reply !== null
				)
				if (answers.length === 0) {
					res.writeHead(202)
					return res.end()
				}
				json(res, 200, Array.isArray(message) ? answers : answers[0])
			})
		},
	}
}
