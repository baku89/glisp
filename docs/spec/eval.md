# Glisp Evaluation Model

## Evaluation node

The fundamental unit of the evaluation model is an **evaluation node**: a pair `(AST, env)` of a syntax-tree node together with the scope environment in which it is to be evaluated.

The same AST node under different envs is a different evaluation node and (in general) yields a different value. Two references that resolve to the same `(AST, env)` pair denote the very same evaluation, share the same memoized result, and form a single shared node in the evaluation DAG.

The AST and the env are kept separate because they capture different things:

- **AST**: a static, immutable, pure tree, fixed at parse time. AST nodes do **not** carry parent pointers; subtrees can be freely shared, grafted, or transformed.
- **Env**: a dynamic chain that represents both the ancestor AST positions and the scope context of the current evaluation. The ancestor information needed for path navigation lives here, not on the AST itself.

## AST tree

The AST is the parse-time structure. Despite the name, it is a **concrete syntax tree (CST)**: it retains enough source-level information to round-trip the original source verbatim.

Each node carries:

- A list of syntactic children (head + arguments for applications, fields for records, elements for vectors, etc.).
- An array of **inter-position trivia** — whitespace and comments between the structural positions of the node. The number of slots depends on the node type's template (see below).
- Attached `^{...}` metadata.

Delimiters (`(`, `)`, `[`, `]`, `{`, `}`, `:` between record key and value, `=` between let-binding name and value, `^` introducing metadata, etc.) are **not** stored on the node. They are implied by the node's type at print time.

### Trivia per node type

For each node type, the number of trivia slots reflects the syntactic positions in its template. Some delimiters allow whitespace on both sides (flexible); others are glued to the adjacent token (sticky):

| Node type | Children | Trivia slots | Notes |
|---|---|---|---|
| Application `(head arg0 … argN)` | `1 + N` (head + args) | `N + 2` | inside `(` and `)` |
| Vector `[e0 … eN]` | `N + 1` | `N + 2` | inside `[` and `]` |
| Record outer `{f0 … fN}` | `N + 1` fields | `N + 2` | inside `{` and `}` |
| Let-block outer `{b0 … bN-1 expr?}` | `N` bindings + optional trailing expr | (count + 1) | inside `{` and `}` |
| Record-field `name: value` | 2 | 2 | flexible: trivia allowed on both sides of `:` |
| Let-binding `name = value` | 2 | 2 | flexible: trivia allowed on both sides of `=` |
| Kwarg `key=value` | 2 | 2 | flexible: trivia allowed on both sides of `=` |
| Metadata-attached `^{meta} expr` | 2 | 1 | `^` is **sticky** to `{`; trivia only between `^{...}` and `expr` |
| Quasiquote `` `expr `` | 1 | 0 | **sticky**: backtick glued to next form |
| Unquote `~expr` | 1 | 0 | **sticky** |
| Unquote-splice `...~expr` | 1 | 0 | **sticky** |
| Path `../...`, `./...` | atom-internal | 0 | path tokens are single atoms; no trivia inside |

The flexible/sticky split is chosen so layout-affecting delimiters (`:`, `=`) accommodate multi-line forms, while prefix-style modifiers (`^`, `` ` ``, `~`, `...~`) remain visually attached to what they modify.

No parent pointer. The "where am I in the tree" information is supplied by the env at evaluation time. Subtrees are immutable and freely shareable / graftable across other trees. Source positions are not stored explicitly; they are derivable by walking trivia.

## Environment

The env is the **scope context** in which an AST is evaluated: a chain of frames, each describing one level of enclosing scope (and providing the ancestor structure that path navigation walks).

```
Env  ::= null            ;; root sentinel (above top-level)
       | Frame
Frame = {
  ast:      ASTNode            ;; the AST node this frame represents
  parent:   Env                ;; one level up
  bindings: Map<Name, (AST, Env)>?   ;; only on scope-introducing frames
}
```

When `eval` recurses into a syntactic child of the current AST, the env naturally tracks the ancestor chain — every let-block, function literal, record, vector, application, and quasiquoted form is pushed as a frame on the way down. Records, vectors, applications, and quasiquotes contribute no `bindings` (transparent to bare-name lookup) but participate in path navigation.

However, **the env and the AST being evaluated are independent**: for a host-driven `eval(ast, env)`, the AST need not be a structural descendant of `env`'s top frame. The env is only consulted for name and path resolution; it does not constrain what AST may be evaluated against it. Hosts can synthesize an AST on the fly, or pull a sub-expression out of a larger tree, and evaluate it against any env that supplies the names and ancestor levels the AST refers to.

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

### Quasiquoted forms during evaluation

The macro-related annotations (`` ` ``, `~`, `...~`) are **transparent during evaluation**. `eval` produces the same value as if the annotations were not present. The annotations only matter for `expand` (see [Multi-step evaluation](#multi-step-evaluation--abstraction-ladder)).

In particular, `eval((pow 2 3), env)` yields the final value `8` directly; there is no intermediate AST construction during normal evaluation.

### Paths across quasiquote boundaries

For `expand`, where quasiquote/unquote do affect tree construction, paths inside an unquote skip the matched quasiquote/unquote pair: `.` counts from the position of the canceled quasiquote rather than the path's lexical position. This matches the intuition that `~` "lifts the expression out" to the surrounding scope.

In a purely quoted region (not inside `~`), path atoms remain as data in the resulting AST, to be resolved later when the form is spliced into evaluable position elsewhere.

Nested quasiquote/unquote pairs cancel level by level.

### Special forms

Three forms have evaluation semantics that go beyond ordinary function application: `?` (match), `|>` (pipe), and `%` (partial-application placeholder). See [syntax.md](./syntax.md#special-forms) for surface syntax.

#### `%` — partial-application desugaring

`%` is rewritten to a function literal by a pre-evaluation pass over the AST. The pass is bottom-up: any node N ∈ {Application, Vector, Record} that directly contains the bare token `%` is replaced with an internal function-literal AST equivalent to

```
(=> (x: T) [N with all % occurrences replaced by x])
```

where the parameter type `T` is **inferred from context** during the type-inference pass — typically from how the surrounding expression uses N's value. The desugared literal is *internal*: the source-level rule "every parameter must be named with a type annotation" applies to user-written code, not to AST nodes synthesized by this pass. The inference pass closes the gap by deriving `T`.

Bottom-up order ensures `%` binds to its **smallest** enclosing form. After this pass:

- The AST contains no remaining bare `%` tokens at expression positions; any leftover `%` (in a type position, parameter list, or record key — see [syntax.md](./syntax.md#partial-application--)) is a syntax error.
- A function literal `(=> ...)` may legitimately enclose a desugared sub-expression: `(=> (x: number): R (* x %))` becomes `(=> (x: number): R (=> (y: number) (* x y)))`, a higher-order result. The outer literal's body now contains an inner literal — both are valid.
- All subsequent `eval` / `expand` proceeds on a `%`-free AST.

#### `?` — match

The AST has the shape `(? value pat1 res1 pat2 res2 ... patN resN)`. The total argument count after the head must be odd (one `value` plus an even number of clause halves); otherwise a syntax error.

Evaluation:

1. Force `value` to a value V.
2. For each clause `(patK, resK)` in order:
   1. If `patK` evaluates to a **type** T, run a non-fallback cast of V against T. If V belongs to T, the clause matches: force and return `resK`.
   2. Otherwise, force `patK` to a value P, and compare V to P by structural equality. If equal, the clause matches: force and return `resK`.
3. If no clause matches, return `()`.

The "non-fallback cast" used in 2.i is an internal evaluator primitive that yields a boolean ("does V belong to T?") instead of producing the type's `default`. Diagnostics generated by failed match-attempts on intermediate clauses are discarded; only diagnostics from the value, from the matched clause, or from the no-match `()` propagate.

A static check ensures every `resK` has the same type. The result type of the whole `?` form is that common type.

#### `|>` — pipe

The AST has the shape `(|> input step1 step2 ... stepN)`. After the `%` desugaring pass:

- If `input` is the bare `%`, the desugaring pass has already rewritten the entire form to `(=> (x) (|> x step1 ... stepN))`, so the `|>` evaluation rule below applies inside that closure body.
- Otherwise, `input` is an ordinary expression and each `stepK` is an ordinary expression evaluating to a function.

Evaluation:

1. Force `input` to a value V.
2. For K = 1 to N: force `stepK` to a function FK; set V := FK(V).
3. Return V.

If any `stepK` does not evaluate to a function, the call FK(V) is a type error, handled by the standard default-fallback rules at the surrounding typed slot.

## Multi-step evaluation / Abstraction ladder

A core design principle of Glisp: **every expression has an abstraction ladder** — a chain of progressively-more-evaluated forms with the same final value. Hosts (in particular visual / GUI editors) can show, edit, and reason at any rung.

Concrete example:

```glisp
pow = (=> (x: number a: number): number `(* ...~(repeat x a)))

(pow (+ 1 1) 3)                              ;; rung 0: source
(* (+ 1 1) (+ 1 1) (+ 1 1))                  ;; rung 1: one expansion step
8                                            ;; rung ∞: final value
```

This is the language analogue of "Expand Appearance" in vector graphics editors: any sub-form can be replaced by a more concrete form below it on the ladder, or its final value, without changing meaning.

### Two operations

```
eval:    (AST, Env) → Value
expand:  (AST, Env) → AST           ;; one expansion step, returns intermediate AST
```

- `eval` produces the final value. It treats macro-related annotations as transparent.
- `expand` performs one expansion step. It substitutes a call's body with its arguments, respecting `` ` ``, `~`, `...~` as a template for shaping the result AST. Repeated `expand` calls climb down the ladder.

Both operations agree on the final value: `eval(AST, env)` equals `eval(expand(AST, env), env)`.

### Hygiene (future work)

`expand`'s substitution is not the textual replacement that would suffice in a hygienic-free system. Symbols in the body (e.g. `*`) refer to bindings in the body's defining scope; if the call site has shadowed those names, naive substitution would capture the wrong binding.

A correct `expand` rewrites such free references in the body into paths that re-anchor to the original binding (e.g. `*` may be rewritten to `../../../*` referring to the Prelude). This is the standard hygienic-macro problem.

The first implementation may use naive substitution; hygienic rewriting is a planned extension.

## Failure as `()`

`()` (the unit literal) is the canonical signal for "value cannot be determined". Any evaluator failure produces `()`:

- Unresolvable bare name (no frame in the chain has the name).
- Path navigating above top-level or addressing a non-existent child.
- Out-of-bounds access (`[].1`, `(rec "missing-key")`).
- Cycle detected during forcing.
- Sub-expression that cannot be reduced to a value for any reason.

`()` is polymorphic in the sense that it is accepted at any typed slot (function parameter, record field declared with `:`, cast). When `()` arrives at a typed slot of type `T`, it is coerced to `T`'s `default` metadata value (see [types.md](./types.md)).

A diagnostic is emitted at the failure source and at the coercion site (with optional suppression for declared-optional positions).

The dual role of `()`:

- As an explicit value: the unique inhabitant of `unit`.
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
