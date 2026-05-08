# Glisp Evaluation Model

## Evaluation node

The fundamental unit of the evaluation model is an **evaluation node**: a pair `(AST, env)` of a syntax-tree node together with the scope environment in which it is to be evaluated.

The same AST node under different envs is a different evaluation node and (in general) yields a different value. Two references that resolve to the same `(AST, env)` pair denote the very same evaluation, share the same memoized result, and form a single shared node in the evaluation DAG.

The AST and the env are kept separate because they capture different things:

- **AST**: a static, immutable, pure tree, fixed at parse time. AST nodes do **not** carry parent pointers; subtrees can be freely shared, grafted, or transformed.
- **Env**: a dynamic chain that represents both the ancestor AST positions and the scope context of the current evaluation. The ancestor information needed for path navigation lives here, not on the AST itself.

## AST tree

The AST is the parse-time structure. Each node has:

- A list of syntactic children (head + arguments for applications, fields for records, elements for vectors, etc.).
- Static metadata: source position, attached `^{...}` metadata.

No parent pointer. The "where am I in the tree" information is supplied by the env at evaluation time.

## Environment

The env is the chain of ancestor AST nodes from the top-level down to (but not including) the AST currently being evaluated. Each frame records which AST node it represents, plus optional bindings introduced by that node.

```
Env  ::= null            ;; root sentinel (above top-level)
       | Frame
Frame = {
  ast:      ASTNode            ;; the AST node at this level
  parent:   Env                ;; one level up
  bindings: Map<Name, (AST, Env)>?   ;; only on scope-introducing frames
}
```

Every ancestor AST node — let-blocks, function literals, records, vectors, function applications, quasiquoted forms — appears as a frame. Records, vectors, applications, and quasiquotes contribute no `bindings` (transparent to bare-name lookup) but participate in path navigation.

Three kinds of frames carry `bindings`:

| Frame | `parent` | `bindings` |
|---|---|---|
| Top-level | `null` | host-provided initial bindings |
| Let-block `{a = ... b = ... ...}` | enclosing frame | each `name → (value-AST, this-frame)` where `value-AST` is the expression on the right of `=` (self-referential, enables recursive bindings) |
| Function body | the closure's captured lexical env | each `parameter → (argument-AST, caller's env)` where `argument-AST` is the expression passed at the call site |

When `eval` recurses into a child of the current AST, it pushes a new frame `{ ast: currentAST, parent: env, bindings: bindings-if-any }` and evaluates the child against the extended env.

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

Walk `e`'s frame chain. At each frame, check whether its `bindings` (if any) contain `x`. Return the innermost found `(AST, env)` pair. If no frame contains `x`, emit a diagnostic and yield `()` as the resolved value (see [Failure as `()`](#failure-as-)).

Frames without `bindings` (records, vectors, applications, quasiquotes) are skipped — they are transparent to bare-name lookup.

## Path lookup

For a path atom with `k` leading `.` characters (`./...` is `k=1`, `../...` is `k=2`, ...) followed by zero or more `/segment` parts at env `e`:

1. Walk `e` up by `k` frames. The frame reached is the **target frame**; its `ast` is the **target AST node**.
2. From the target, descend through the segments. A segment is a name (record field, kwarg name, let-block binding, function parameter) or an integer (an index into the syntactic children of the node, in source order).
3. The result is the evaluation node `(target_AST, env_at_target)`.

For a function application `(head arg0 arg1 ...)`, the indices are `0` = head, `1` = `arg0`, `2` = `arg1`, etc. For a vector `[e0 e1 ...]`, indices are `0` = `e0`, `1` = `e1`, etc.

`env_at_target` is the env that the target AST would be evaluated in if reached by ordinary recursive descent from the top-level: walk the AST from top-level down to the target, pushing a frame at each scope-introducing form on the way:

- **Let-block** entered: push a frame whose bindings are the let-block's `name = value` pairs (with self-referential `parent`).
- **Function literal** entered (i.e. path traverses into a function literal's body without a call): push a parameter frame whose bindings are **empty**, and whose `parent` is the lexical env that would have captured the literal at that position.
- **Top-level**: the host's initial env.

For path traversals that stay within scope-flat structures (records, vectors, applications, quasiquotes), `env_at_target` equals the current env — no pop/push is needed.

When a path lands inside an uncalled function body, parameter references resolve to nothing and yield `()`, which is then handled by the missing-value machinery at the next typed slot.

If the parent walk takes the path above top-level, or a segment fails to address any child, emit a diagnostic and yield `()` (see [Failure as `()`](#failure-as-)).

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

### Cycle detection

The memoization cache holds three states per evaluation node:

```
State = NotComputed | InProgress | Computed { value, diagnostics }
```

When forcing `(AST, env)`:

- `Computed`: return the cached value.
- `InProgress`: a cycle is detected. Return `()` and emit a diagnostic. Do not transition state — the in-progress entry remains so the outer evaluation that started this cycle finishes normally and writes `Computed`.
- `NotComputed`: transition to `InProgress`, evaluate, store `Computed`, return.

Examples like `{a: ./b  b: ./a}` resolve via this rule: each field becomes `()`, which is then coerced to its declared type's default at the next typed slot.

### Quasiquoted forms

Within `` `(...) ``, sub-expressions are not evaluated; the form is data. Only `~expr` and `~@expr` are evaluated, in the surrounding env. The result of `` `... `` is a syntax-tree value.

## Failure as `()`

`()` (the Unit literal) is the canonical signal for "value cannot be determined". Any evaluator failure produces `()`:

- Unresolvable bare name (no frame in the chain has the name).
- Path navigating above top-level or addressing a non-existent child.
- Out-of-bounds access (`[].1`, `(rec "missing-key")`).
- Cycle detected during forcing.
- Sub-expression that cannot be reduced to a value for any reason.

`()` is polymorphic in the sense that it is accepted at any typed slot (function parameter, record field declared with `:`, cast). When `()` arrives at a typed slot of type `T`, it is coerced to `T`'s `default` metadata value (see [types.md](./types.md)).

A diagnostic is emitted at the failure source and at the coercion site (with optional suppression for declared-optional positions).

The dual role of `()`:

- As an explicit value: the unique inhabitant of `Unit`.
- As an implicit signal: "missing", coerced to the slot type's default at typed slots.

In the second role `()` flows through untyped positions (let-block bindings, vector elements, intermediate expressions) and is only converted at a slot that carries a type expectation.

## Diagnostics

Evaluation never throws. Each evaluation produces a set of diagnostics alongside its value. A diagnostic carries the location at which it was produced:

```
Diagnostic = {
  level:   'error' | 'warning' | 'info'
  message: string
  source:  (AST, Env)        ;; the evaluation node that produced it
}

Diagnostics = Set<Diagnostic>
```

The diagnostics attached to an evaluation node are the **union** of:

- Diagnostics produced directly at this node (type mismatch, unresolvable name, path failure, cycle, etc.).
- Diagnostics propagated from every sub-evaluation reached during this evaluation.

So evaluating `(* (+ "undo" 4) 20)` carries up the type-mismatch diagnostic from `(+ "undo" 4)` to the surrounding `(* ... 20)`. The host can query the outermost evaluation node and obtain every diagnostic that occurred below it.

Diagnostics are stored on the same memo cache as values, with a three-state shape (see [Cycle detection](#cycle-detection)):

```
State    = InProgress | Computed { value: Value, diagnostics: Diagnostics }
MemoCache: Map<(AST, Env), State>
```

A missing entry is implicitly "not computed yet". Because `eval` is pure, the same evaluation node always yields the same value and the same diagnostic set, so the cache is consistent.

The evaluator's return value is a plain `Value`. Diagnostic information is reached via the evaluation node, not the value itself, so primitive values do not need to be wrapped.

## Static name resolution pass

Before evaluation, a static resolution pass walks the AST and verifies that every bare name and every path can be resolved against the surrounding container/scope structure. Unresolvable references are recorded as diagnostics. The pass does not evaluate; it only validates. Implementations may additionally cache resolved binding/path pointers as an optimization.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic propagate up the surrounding expression?
- **Partial evaluation**: any evaluation node is in principle evaluable. What host API surfaces this for tooling?
- **Incremental / differential evaluation**: when an input AST node is replaced, what is the cache invalidation rule?
- **Bidirectional evaluation**: editing a result value, how is the corresponding input inferred?
- **Paths across quasiquote boundaries**: do paths inside `~expr` traverse through the quasiquote frames or skip over them?
