# Glisp Evaluation Model

## Environment as the unit of evaluation

An environment represents a position in the syntax tree, augmented with the binding context surrounding it. It is the chain of AST nodes from top-level down to the expression currently under consideration; the topmost frame holds the AST node being evaluated.

Because the env carries the current AST as its top frame, every operation is a function of env alone:

```
eval:    Env → Value
infer:   Env → Type
```

The "evaluation node" of an expression is its env. Two expressions share the same evaluation node iff they yield the same env (same chain identity).

## Environment structure

```
Env  ::= null              ;; root sentinel (above top-level)
       | Frame
Frame = {
  ast:      ASTNode        ;; the AST node at this level
  parent:   Env            ;; one level up
  bindings: Map<Name, Env>?  ;; only on let-blocks and function literals
}
```

Each AST node along the chain may contribute:

- **Bindings** (let-blocks, function literals): a mapping from binding names to the Env that, when evaluated, yields the binding's value. Each binding's Env has its own AST (the value or argument expression) at the top.
- **Addressable children** (records, vectors, applications, let-blocks, function literals): the structural children visible to path navigation.

Records, vectors, function applications, and quasiquoted forms appear as frames in the chain but contribute no bindings — they are transparent to bare-name lookup, while still participating in path navigation.

Three kinds of frames carry bindings:

| Frame | `parent` | `bindings` |
|---|---|---|
| Top-level | `null` | host-provided initial bindings |
| Let-block `{a = ... b = ... ...}` | enclosing frame | each `name → env_a` where `env_a.ast` is the value expression on the right of `=` and `env_a.parent` is this very let-block frame (self-referential, enables recursive bindings) |
| Function body | the closure's captured lexical env | each `parameter → env_p` where `env_p.ast` is the argument expression at the call site and `env_p.parent` is the caller's env |

## Closures

A function value is a closure: the function literal AST paired with the env in which the literal was evaluated.

```
Closure = (function_literal_AST, captured_env)
```

When the closure is called, a new function-body frame is pushed:

```
body_frame = {
  ast:      function_literal_AST.body
  parent:   closure.captured_env       ;; lexical scope
  bindings: { pᵢ: caller_env_extended_with_arg_AST_for_pᵢ }
}
```

The body's environment is therefore the lexical environment of the function literal extended with the parameter bindings. Argument expressions are evaluated in the caller's environment.

## Bare-name lookup

For a bare name `x` at env `e`:

```
resolve(x, e): Env
```

Walk `e`'s frame chain (starting from `e` itself, then `e.parent`, and so on); at each frame check whether its `bindings` (if any) contain `x`. Frames without bindings (records, vectors, applications, quasiquotes) are skipped. Return the innermost found Env. If no frame contains `x`, emit a diagnostic and yield the surrounding context's expected default.

## Path lookup

For a path atom with `k` leading `.` characters (`./...` is `k=1`, `../...` is `k=2`, ...) followed by zero or more `/segment` parts at env `e`:

1. Each `.` walks one AST level up. So we step from `e` through `parent` `k` times to reach the **target frame**.
2. From the target frame, descend through the segments. A segment is a name (record field, kwarg name, let-block binding, function parameter) or an integer (an index into the syntactic children of the node, in source order).
3. The result is the env at the addressed AST position (with that AST at its top).

For a function application `(head arg0 arg1 ...)`, the indices are `0` = head, `1` = `arg0`, `2` = `arg1`, etc. For a vector `[e0 e1 ...]`, indices are `0` = `e0`, `1` = `e1`, etc.

If the dots take the path above top-level, or a segment fails to address any child, emit a diagnostic and yield the surrounding context's expected default.

Path navigation traverses the full AST tree; records, vectors, applications, and quasiquotes participate (unlike bare-name lookup). Wrapping an expression in a vector therefore changes the dot-count required to reach an outer position.

## Evaluation

```
eval: Env → Value
```

`eval` is a pure function of env. For any fixed env identity the result is identical, so the result can be memoized on env identity. Memoization on the env is what makes shared sub-computations explicit as a DAG: two references to the same binding resolve to the same env, so they share a single cached value.

### Lazy semantics

- Let-block bindings and function arguments are not evaluated when the binding/call frame is created. They are evaluated lazily when the bound name is used.
- Forcing a name `x` at env `e` means: `eval(resolve(x, e))`.
- The forced result is memoized on the resolved env's identity and reused on subsequent forces.
- Forcing happens when a value is needed: as the operand of a primitive operation, as the value being cast, as the predicate of a conditional, when read by the host, etc.

### Quasiquoted forms

Within `` `(...) ``, sub-expressions are not evaluated; the form is data. Only `~expr` and `~@expr` are evaluated, in the surrounding env. The result of `` `... `` is a syntax-tree value.

## Diagnostics

Evaluation never throws. Diagnostics (errors, warnings, info) are produced as a parallel side channel keyed by env:

```
DiagnosticsTable: Map<Env, Diagnostics>
```

Because envs have stable identity, primitive values do not need to be wrapped to carry diagnostics. The host queries diagnostics by the env, not by the value.

The memoization cache and the diagnostics table share the same key space:

```
MemoCache: Map<Env, { value: Value, diagnostics: Diagnostics }>
```

The evaluator's return value is a plain `Value`. Diagnostic information is reached via the env.

## Static name resolution pass

Before evaluation, a static resolution pass walks the AST and verifies that every bare name and every path can be resolved against the surrounding container/scope structure. Unresolvable references are recorded as diagnostics. The pass does not evaluate; it only validates. Implementations may additionally cache resolved binding/path pointers as an optimization.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic propagate up the surrounding expression?
- **Cycle detection**: a path or recursive binding that loops back to itself (`{a: ./b  b: ./a}`) needs to be detected and resolved to default fallback.
- **Partial evaluation**: any env is in principle evaluable. What host API surfaces this for tooling?
- **Incremental / differential evaluation**: when an input AST node is replaced, what is the cache invalidation rule?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Paths across quasiquote boundaries**: do paths inside `~expr` traverse through the quasiquote frames or skip over them?
