# Glisp Evaluation Model

## Evaluation node

The fundamental unit of the evaluation model is an **evaluation node**: a pair `(AST, env)` of a syntax-tree node together with the scope environment in which it is to be evaluated.

The same AST node under different envs is a different evaluation node and (in general) yields a different value. Two references that resolve to the same `(AST, env)` pair denote the very same evaluation, share the same memoized result, and form a single shared node in the evaluation DAG.

The AST and the env are kept separate because they capture different things:

- **AST**: a static position in the syntax tree, fixed at parse time. AST nodes carry parent pointers so the tree can be walked structurally.
- **Env**: a dynamic scope context, established when a scope-introducing form (let-block, function call) is entered.

## AST tree

The AST is the parse-time structure. Each node has:

- A list of syntactic children (head + arguments for applications, fields for records, elements for vectors, etc.).
- A parent pointer to the immediately enclosing AST node.
- Static metadata: position, source, attached `^{...}` metadata.

Path atoms (`./...`, `../...`) navigate the AST via these parent and child links. Path navigation does not consult the env.

## Environment

```
Env  ::= null            ;; root sentinel
       | Frame
Frame = {
  parent:   Env
  bindings: Map<Name, (AST, Env)>
}
```

Three kinds of frames:

| Frame | `parent` | `bindings` |
|---|---|---|
| Top-level | `null` | host-provided initial bindings |
| Let-block `{a = ... b = ... ...}` | enclosing frame | each `name → (value-AST, this-frame)` where `value-AST` is the expression on the right of `=` (self-referential, enables recursive bindings) |
| Function body | the closure's captured lexical env | each `parameter → (argument-AST, caller's env)` where `argument-AST` is the expression passed at the call site |

Records, vectors, function applications, and quasiquoted forms do **not** introduce frames. They appear in the AST tree (and are reachable via paths) but contribute no bindings. The env is therefore changed only when entering a let-block, calling a function, or starting at the top level.

## Closures

A function value is a closure: the function literal AST paired with the env in which the literal was evaluated.

```
Closure = (function_literal_AST, captured_env)
```

When the closure is called, a new function-body frame is pushed:

```
body_frame = {
  parent:   closure.captured_env       ;; lexical scope
  bindings: { pᵢ: (argᵢ-AST, caller_env) for each parameter pᵢ }
}
```

Argument expressions are evaluated in the caller's env (where they textually appear).

## Bare-name lookup

For a bare name `x` at env `e`:

```
resolve(x, e): (AST, Env)
```

Walk `e`'s frame chain. At each frame, check whether its `bindings` contain `x`. Return the innermost found `(AST, env)` pair. If no frame contains `x`, emit a diagnostic and yield the surrounding context's expected default.

The walk covers only scope frames; AST nesting (records, vectors, applications) does not appear in the env, so it is automatically transparent to bare-name lookup.

## Path lookup

For a path atom with `k` leading `.` characters (`./...` is `k=1`, `../...` is `k=2`, ...) followed by zero or more `/segment` parts at AST node `a`:

1. Walk `a`'s parent pointers `k` times, reaching the **target AST node**.
2. From the target, descend through the segments. A segment is a name (record field, kwarg name, let-block binding, function parameter) or an integer (an index into the syntactic children of the node, in source order).
3. The result is the evaluation node `(target_AST, env_at_target)`.

For a function application `(head arg0 arg1 ...)`, the indices are `0` = head, `1` = `arg0`, `2` = `arg1`, etc. For a vector `[e0 e1 ...]`, indices are `0` = `e0`, `1` = `e1`, etc.

`env_at_target` is the env that surrounds the target AST node — it is computed by following `e` up through scope frames whose corresponding AST contains or equals the target. In practice this means: the env active at the target node's nearest enclosing scope-introducing form. It is the env in which the target AST would be evaluated if encountered there directly.

If the parent walk takes the path above top-level, or a segment fails to address any child, emit a diagnostic and yield the surrounding context's expected default.

Path navigation traverses the full AST tree; records, vectors, applications, and quasiquotes participate (unlike bare-name lookup). Wrapping an expression in a vector therefore changes the dot-count required to reach an outer position.

## Evaluation

```
eval: (AST, Env) → Value
```

`eval` is a pure function over evaluation nodes. For any fixed `(AST, env)` pair the result is identical, so the result can be memoized on `(AST identity, env identity)`. Memoization on the evaluation node is what makes shared sub-computations explicit as a DAG.

When `eval` recurses into a sub-expression, it passes the sub-AST and the *same* env (no new frame created), unless the sub-expression is itself a scope-introducing form (let-block, function call), in which case a new frame is pushed.

### Lazy semantics

- Let-block bindings and function arguments are not evaluated when the binding/call frame is created. They are evaluated lazily when the bound name is used.
- Forcing a name `x` at env `e` means: `eval(resolve(x, e))`.
- The forced result is memoized on `(binding_AST, binding_env)` and reused on subsequent forces.
- Forcing happens when a value is needed: as the operand of a primitive operation, as the value being cast, as the predicate of a conditional, when read by the host, etc.

### Quasiquoted forms

Within `` `(...) ``, sub-expressions are not evaluated; the form is data. Only `~expr` and `~@expr` are evaluated, in the surrounding env. The result of `` `... `` is a syntax-tree value.

## Diagnostics

Evaluation never throws. Diagnostics (errors, warnings, info) are produced as a parallel side channel keyed by evaluation node:

```
DiagnosticsTable: Map<(AST, Env), Diagnostics>
```

Because evaluation nodes have stable identity, primitive values do not need to be wrapped to carry diagnostics. The host queries diagnostics by the evaluation node, not by the value.

The memoization cache and the diagnostics table share the same key space:

```
MemoCache: Map<(AST, Env), { value: Value, diagnostics: Diagnostics }>
```

The evaluator's return value is a plain `Value`. Diagnostic information is reached via the evaluation node.

## Static name resolution pass

Before evaluation, a static resolution pass walks the AST and verifies that every bare name and every path can be resolved against the surrounding container/scope structure. Unresolvable references are recorded as diagnostics. The pass does not evaluate; it only validates. Implementations may additionally cache resolved binding/path pointers as an optimization.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic propagate up the surrounding expression?
- **Cycle detection**: a path or recursive binding that loops back to itself (`{a: ./b  b: ./a}`) needs to be detected and resolved to default fallback.
- **Path env reconstruction**: precisely how `env_at_target` is computed for a path that lands inside a different scope (e.g. inside a function literal that has not been called).
- **Partial evaluation**: any evaluation node is in principle evaluable. What host API surfaces this for tooling?
- **Incremental / differential evaluation**: when an input AST node is replaced, what is the cache invalidation rule?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Paths across quasiquote boundaries**: do paths inside `~expr` traverse through the quasiquote frames or skip over them?
