# Glisp Evaluation Model

## Evaluation node

The fundamental unit of the evaluation model is an **evaluation node**: a pair `(AST, env)` of a syntax-tree node together with the environment in which it is to be evaluated.

The same AST node under different envs is a different evaluation node and (in general) yields a different value. Two references that resolve to the same `(AST, env)` denote the very same evaluation, share the same memoized result, and form a single shared node in the evaluation DAG.

Throughout this document, "AST position" is shorthand for an evaluation node `(AST, env)`.

## Environment

An environment is **not** a `Map<Name, Value>` of evaluated values. It is the chain of AST nodes that surround the current expression — every parent AST node from the current position back to the top-level. Each AST node in the chain may contribute:

- **Bindings** (only let-blocks and function literals contribute these): a `Map<Name, (value-AST, env-for-evaluating-it)>`.
- **Addressable children**: the structural children of the node (record fields, vector elements, call arguments, etc.).

```
Env  ::= null            ;; root sentinel
       | Frame
Frame = {
  ast:        ASTNode    ;; the AST node at this level
  parent:     Env        ;; one level up
  bindings:   Map<Name, (AST, Env)>?  ;; only on let-blocks and function literals
}
```

Records (`{x: 10}`), vectors (`[...]`), function applications (`(fn args)`), and quasiquoted forms (`` `(...) ``) appear as frames in the chain but contribute no bindings — they are transparent to bare-name lookup, while still participating in path navigation.

Three kinds of frames carry bindings:

| Frame | `parent` | `bindings` |
|---|---|---|
| Top-level | `null` | host-provided initial bindings |
| Let-block `{a = ... b = ... ...}` | enclosing frame | each `name → (value-AST, this-frame)` where `value-AST` is the expression on the right of `=` (self-referential, enables recursive bindings) |
| Function body | the closure's captured lexical env | each `parameter → (argument-AST, caller's env)` where `argument-AST` is the expression passed at the call site |

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
  bindings: { pᵢ: (argᵢ-AST, caller_env) for each parameter pᵢ }
}
```

The body's environment is therefore the lexical environment of the function literal extended with the parameter bindings. Argument expressions are evaluated in the caller's environment (where they textually appear).

## Bare-name lookup

For a bare name `x` at env `e`:

```
resolve(x, e) = (binding_AST, binding_env)
```

Walk up `e`'s frame chain; at each frame check whether its `bindings` (if any) contain `x`. Frames without bindings (records, vectors, applications, quasiquotes) are skipped. Return the innermost found pair. If no frame contains `x`, emit a diagnostic and yield the default of the surrounding context's expected type.

## Path lookup

For a path atom with `k` leading `.` characters (so `./...` is `k=1`, `../...` is `k=2`, etc.) followed by zero or more `/segment` parts:

1. From the current frame, walk up `k − 1` parents, then take that frame's parent. (Equivalently: each `.` walks one AST level up; the first `.` walks out of the path expression itself.)
2. At that frame, descend through the segments. A segment is a name (record field, kwarg name, let-block binding, function parameter) or an integer (an index into the syntactic children of the node, in source order). Each segment moves to the addressed child AST node.

   For a function application `(head arg0 arg1 ...)`, the indices are: `0` = head, `1` = `arg0`, `2` = `arg1`, etc. For a vector `[e0 e1 ...]`, indices are `0` = `e0`, `1` = `e1`, etc.
3. The result is the evaluation node `(target_AST, target_env)`, where `target_env` is the frame at the addressed position.

If the dots take the path above top-level, or a segment fails to address any child, emit a diagnostic and yield the surrounding context's expected default.

Path navigation traverses the full AST tree. Records, vectors, applications, and quasiquotes participate (unlike bare-name lookup). Wrapping an expression in a vector therefore changes the dot-count required to reach an outer position.

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

## Diagnostics

Evaluation never throws. Diagnostics (errors, warnings, info) are produced as a parallel side channel keyed by evaluation node:

```
DiagnosticsTable: Map<EvaluationNode, Diagnostics>
```

Because evaluation nodes `(AST, env)` have stable identity, primitive values do not need to be wrapped to carry diagnostics. The host queries diagnostics by the evaluation node, not by the value.

The memoization cache and the diagnostics table share the same key space:

```
MemoCache: Map<EvaluationNode, { value: Value, diagnostics: Diagnostics }>
```

The evaluator's return value is a plain `Value`. Diagnostic information is reached via the evaluation node.

## Static name resolution pass

Before evaluation, a static resolution pass walks the AST and verifies that every bare name and every path can be resolved against the surrounding container/scope structure. Unresolvable references are recorded as diagnostics. The pass does not evaluate; it only validates. Implementations may additionally cache resolved binding/path pointers as an optimization.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic propagate up the surrounding expression?
- **Cycle detection**: a path or recursive binding that loops back to itself (`{a: ./b  b: ./a}`) needs to be detected and resolved to default fallback.
- **Partial evaluation**: any evaluation node is in principle evaluable. What host API surfaces this for tooling?
- **Incremental / differential evaluation**: when an input AST node is replaced, what is the cache invalidation rule?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Paths across quasiquote boundaries**: do paths inside `~expr` traverse through the quasiquote frames or skip over them?
