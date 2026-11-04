/**
 * A program for a test, written as a block of what it draws, in order, as it is drawn: that
 * many tests are about something else, and this is what a program of theirs comes to.
 */

import { type AST, buildPrelude, parse as parsed } from '@glisp/lang'

import { withGraphics } from './graphics'
import { withLayersFromOrder } from './scene'

const env = withGraphics(buildPrelude())

export const parse = (source: string): AST => withLayersFromOrder(parsed(source), env)
