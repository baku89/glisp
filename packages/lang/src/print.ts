/**
 * Top-level `print(ast)` function. Equivalent to `ast.print()`; provided so
 * the `g.print` API namespace can call it as a plain function and so callers
 * who don't yet have an AST handle (e.g. behind an `AST` union type) have a
 * function-style entry point.
 *
 * The actual rendering logic lives on each AST class (`ASTNode.print()` and
 * its subclass overrides) — see types.ts.
 */

import type { AST } from './types.js'

export function print(ast: AST): string {
	return ast.print()
}
