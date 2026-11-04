import { readFileSync } from 'node:fs'

import { buildPrelude, check } from '@glisp/lang'
import { readProgram } from '@glisp/tweeq/programSource'
import { pastedRows } from '@glisp/tweeq/rowsClipboard'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { parse } from './program.testing'
import { sceneOf } from './scene'

const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')
const example = /## Example\n\n```clojure\n([\s\S]*?)```/.exec(readme)![1]!
const env = withGraphics(buildPrelude())

describe('the example in the README', () => {
	it('can be written in the code panel as it is, and draws', () => {
		const reading = readProgram(example)
		if (!('ast' in reading)) throw new Error(reading.message)
		expect(check(reading.ast, env).filter(({ level }) => level === 'error')).toEqual([])
		expect(sceneOf(reading.ast, env).length).toBeGreaterThan(0)
	})

	it('can be pasted into a project', () => {
		expect(pastedRows(parse('[a = 1]'), env, null, example)).not.toBeNull()
	})
})
