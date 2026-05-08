# Glisp Evaluation Model

## Scope

A scope is a mapping from names to bound values. Two syntactic forms introduce a scope:

| Form | Names introduced |
|---|---|
| Let-block `{a = ...  b = ...  ...}` | each `name` on the left of `=` |
| Function literal `(=> (T U) (x: ...) ...)` | generic parameter names and value parameter names (one combined scope) |

The outermost scope is the top-level scope, provided by the host environment.

Records (`{x: 10}`), vectors (`[...]`), function applications (`(fn args)`), and quasiquoted forms (`` `(...) ``) do **not** introduce scopes.

### Path resolution

The path atom `../x`, `../../x`, ... walks up the chain of enclosing scopes (let-blocks and function literals) by the indicated count, then looks up the trailing name in that ancestor scope.

If the count exceeds the depth of enclosing scopes (i.e. the path tries to walk above top-level), it is an error: a diagnostic is emitted and the result is the `default` of the expected type at the call site.

### Lexical lookup of unqualified names

A bare name `x` is looked up by walking outward through enclosing scopes, choosing the innermost binding. If no binding is found, it is an error: diagnostic emitted, result is the expected type's `default`.

## Open questions

- **Name resolution timing**: at what stage does an `x` or `../x` get resolved to a specific binding? Parse time, a separate resolve pass, or during inference/evaluation?
- **Lazy evaluation specifics**: are let-bindings and function arguments lazy thunks? When are values forced?
- **DAG model**: how is shared reference (multiple uses of the same binding) represented in the evaluated graph?
- **Default fallback** at the value level: what is the precise propagation rule when a sub-expression's evaluation produces a default-fallback value?
- **Partial evaluation**: can an arbitrary subtree be evaluated in isolation given an environment, without forcing its parents?
- **Incremental / differential evaluation**: when an input changes, what is recomputed?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Diagnostics propagation**: how are warnings/errors associated with values, especially primitives that cannot be `WeakMap` keys?
