# Glisp Evaluation Model

## Evaluation node

The fundamental unit of the evaluation model is an **evaluation node**: a pair `(AST, env)` of a syntax-tree node together with the environment in which it is to be evaluated.

The same AST node under different envs is a different evaluation node and (in general) yields a different value. Conversely, two references that resolve to the same `(AST, env)` pair denote the very same evaluation, share the same memoized result, and form a single shared node in the evaluation DAG.

Throughout this document, "AST position" is shorthand for an evaluation node `(AST, env)`.

## Environment

An environment is **not** a `Map<Name, Value>` of evaluated values. It is a chain of frames, each rooted in a syntactic position. Bindings in a frame point to **evaluation nodes** (`(AST, env)` pairs), not to evaluated values.

```
Env  ::= null            ;; root sentinel
       | Frame
Frame = {
  parent: Env
  bindings: Map<Name, (AST, Env)>     ;; name → AST position to evaluate, with the env to evaluate it in
}
```

Three kinds of frames:

| Frame | `parent` | `bindings` |
|---|---|---|
| Top-level | `null` | host-provided initial bindings |
| Let-block `{a = ... b = ... ...}` | enclosing frame | each `name → (value-AST, this-frame)` where `value-AST` is the expression on the right of `=` (self-referential, enables recursive bindings) |
| Function body | the closure's captured lexical env | each `parameter → (argument-AST, caller's env)` where `argument-AST` is the expression passed at the call site |

Records (`{x: 10}`), vectors (`[...]`), function applications (`(fn args)`), and quasiquoted forms (`` `(...) ``) do not introduce frames; they are transparent to `..`. Path counts traverse scope levels (let-blocks and function literals), not AST nesting depth. This makes paths refactor-safe: wrapping an expression in a vector or function application does not change `../...` semantics.

## Closures

A function value is a closure: the function literal AST paired with the env in which the literal was evaluated.

```
Closure = (function_literal_AST, captured_env)
```

When the closure is called with arguments, a new function-body frame is pushed:

```
body_frame = {
  parent: closure.captured_env       ;; lexical scope
  bindings: { pᵢ: (argᵢ-AST, caller_env) for each parameter pᵢ }
}
```

The body's environment is therefore the lexical environment of the function literal extended with the parameter bindings. Argument expressions are evaluated in the caller's environment (where they textually appear).

## Name resolution

For a bare name `x` in some expression at env `e`:

```
resolve(x, e) = (binding_AST, binding_env)
```

Walk up `e`'s frame chain until a frame with `x` in its `bindings` is found, and return that frame's `(binding_AST, binding_env)` pair. If no frame contains `x`, emit a diagnostic and yield the default of the surrounding context's expected type.

For a path atom `../...`/`name` (`k` segments of `..`):

Walk up exactly `k` frames from `e`, then look up `name` in that frame. If `k` exceeds the depth of the chain (path tries to go above top-level), emit a diagnostic and yield the default of the expected type.

## Evaluation

```
eval: (AST, Env) → Value
```

`eval` is a pure function over evaluation nodes. For any fixed `(AST, env)` pair the result is identical, so the result can be memoized on `(AST identity, env identity)`. Memoization on the evaluation node is what makes shared sub-computations explicit as a DAG.

### Lazy semantics

- Let-block bindings and function arguments are not evaluated when the binding/call frame is created. They are evaluated lazily when the bound name is used.
- Forcing a name `x` means: `eval(binding_AST, binding_env)` where `(binding_AST, binding_env) = resolve(x, current_env)`.
- The forced result is memoized on `(binding_AST, binding_env)` and reused on subsequent forces.
- Forcing happens when a value is needed: as the operand of a primitive operation, as the value being cast, as the predicate of a conditional, when read by the host, etc.

### Quasiquoted forms

Within `` `(...) ``, sub-expressions are not evaluated; the form is data. Only `~expr` and `~@expr` are evaluated, in the surrounding env. The result of `` `... `` is a syntax-tree value.

## Static name resolution pass

Before evaluation, a static resolution pass walks the AST and verifies that every name and every `../...` path can be resolved against the lexical scope structure. Names that cannot be resolved are recorded as diagnostics. The pass does not evaluate; it only validates.

Implementations may additionally cache resolved binding pointers on each name reference for faster lookup at evaluation time. This caching is an optimization detail; it does not change the semantic model.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic and the default propagate up the surrounding expression?
- **DAG-level sharing**: multiple `x` references in the same scope all resolve to the same evaluation node. Memoization makes the shared computation explicit. What additional structure (if any) does the implementation expose to surface the DAG?
- **Partial evaluation**: any evaluation node is in principle evaluable. What host API surfaces this for tooling?
- **Incremental / differential evaluation**: when an input AST node is replaced, what is the cache invalidation rule?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Diagnostics propagation mechanism**: Boxed value, `WeakMap<Value, Diagnostics>`, or hybrid. Primitive values cannot be `WeakMap` keys, requiring a side-channel.
