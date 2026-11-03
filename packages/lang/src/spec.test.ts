import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { toAst } from './eval.js'
import { LexError } from './lex.js'
import { parse, ParseError } from './parse.js'
import { buildPrelude } from './prelude.js'
import { assignmentExpression, Session } from './session.js'

const FILES = [
	'spec/syntax.md',
	'spec/types.md',
	'spec/eval.md',
	'site/guide.md',
]

const MARKED_BLOCK = /<!-- test -->\s*```glisp\n([\s\S]*?)```/g

/** Whether more lines are needed before `source` is a whole form. */
function isIncomplete(source: string): boolean {
	try {
		parse(assignmentExpression(source) ?? source)
		return false
	} catch (e) {
		if (!(e instanceof ParseError || e instanceof LexError)) throw e
		return /unterminated|got eof|unexpected eof/i.test(e.message)
	}
}

interface Example {
	readonly source: string
	readonly expected: string | null
}

function examplesIn(block: string): Example[] {
	const examples: Example[] = []
	let pending = ''
	for (const line of block.split('\n')) {
		const [, code = '', comment = ''] = /^([^;]*);?(.*)$/.exec(line) ?? []
		pending += `${code}\n`
		if (pending.trim() === '' || isIncomplete(pending)) continue
		const arrow = /^;\s*→\s*(.*?)(\s{2,}.*)?$/.exec(comment)
		examples.push({ source: pending.trim(), expected: arrow?.[1] ?? null })
		pending = ''
	}
	return examples
}

const blocks = FILES.flatMap(file => {
	const text = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
	return [...text.matchAll(MARKED_BLOCK)].map((match, i) => ({
		name: `${file} #${i + 1}`,
		block: match[1]!,
	}))
})

describe('examples in the spec', () => {
	it('has examples to run', () => {
		expect(blocks.length).toBeGreaterThan(5)
	})

	for (const { name, block } of blocks) {
		it(name, () => {
			const session = new Session(buildPrelude())
			for (const { source, expected } of examplesIn(block)) {
				const { value } = session.exec(source)
				if (expected !== null) {
					expect(toAst(value, session.env).print(), source).toBe(
						parse(expected).print()
					)
				}
			}
		})
	}
})
