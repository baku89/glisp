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
| `~expr` | 1 | 0 | **sticky** |
| Spread `...expr`, `...~expr` | 1 | 0 | **sticky** |
| Path `../...`, `./...` | atom-internal | 0 | path tokens are single atoms; no trivia inside |

The flexible/sticky split is chosen so layout-affecting delimiters (`:`, `=`) accommodate multi-line forms, while prefix-style modifiers (`^`, `~`, `...`) remain visually attached to what they modify.

No parent pointer. The "where am I in the tree" information is supplied by the env at evaluation time. Subtrees are immutable and freely shareable / graftable across other trees. Source positions are not stored explicitly; they are derivable by walking trivia.

### AST node kinds

The AST is a discriminated union keyed by `kind`. Hosts construct ASTs via builders (`lit`, `sym`, etc. — see [host-api.md](./host-api.md)) and rarely need to inspect them, but for macro tooling or formatters that do, the `kind` set is fixed:

| `kind`     | Node                 | Notes                                                         |
| ---------- | -------------------- | ------------------------------------------------------------- |
| `'lit'`    | literal              | a `number`, `string`, `boolean`, or the `unit` value          |
| `'host'`   | host-value embed     | wraps an arbitrary host-side value (typed host fn, type value, `IO`, opaque JS object). Eval yields the value as-is; `print` cannot round-trip it to source. Used by `g.host`. |
| `'sym'`    | symbol               | a bare identifier referring to a binding                       |
| `'call'`   | application          | `(head arg0 arg1 ...)`                                        |
| `'access'` | accessor sugar       | `target.key`. Same eval semantics as `Call(target, [Lit(key)])`; distinct kind for source round-trip |
| `'vec'`    | vector literal       | `[e0 e1 ...]`                                                  |
| `'record'` | record literal | `{x: 10 y: 20}`. The same AST shape expresses a record type when its field values happen to be type values (handled by the type system, not by a different `kind`). |
| `'let'`    | let-block            | `{name = expr ...}`                                           |
| `'fn'`     | function literal     | `(=> ...)` with parameters, return type, optional body        |
| `'path'`   | path                 | `./...`, `../...`                                             |
| `'unquote'`| compute within a step | `~expr`                                                       |
| `'spread'` | spread               | `...expr`; `...~expr` is a spread of an `'unquote'`           |
| `'meta'`   | metadata-attached    | `^{...} expr`                                                 |

The detailed field shape per kind is left to the implementation (e.g. how kwargs are represented inside `'call'`, how generics are stored on `'fn'`). Hosts that pattern-match should rely only on `kind` and on field accessors documented by the implementation.

### AST equality

Two ASTs are equal when they have the same **structural form**, compared recursively:

- Same node type (Application, Vector, Record, Let-block, etc.).
- Same children in the same order, each pair recursively equal.
- Same primitive value for atoms — numbers by IEEE 754 equality, strings by code-point sequence, booleans by identity, the unit literal compared as itself.

Equality **ignores**:

- **Trivia** (whitespace, comments). `(+ 1 2)` and `(+   1   2)` are equal ASTs.
- **Attached metadata `^{...}`**, in line with the rule that metadata does not affect type or value identity ([types.md — Equality](./types.md#equality)).
- **Memory identity**. Two distinct AST instances with the same structure are equal.

This is the structural meaning used by host comparisons.

The memoization cache (see [Cycle detection](#cycle-detection)) is keyed by `(AST instance, env instance)` — **identity-based**, not structure-based — for performance. Two structurally equal but distinct AST instances are different memo keys; that is intentional and harmless because each instance still evaluates to the same value.

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

When `eval` recurses into a syntactic child of the current AST, the env naturally tracks the ancestor chain — every let-block, function literal, record, vector, and application is pushed as a frame on the way down. Records, vectors, and applications contribute no `bindings` (transparent to bare-name lookup) but participate in path navigation.

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

Frames without `bindings` (records, vectors, applications) are skipped — they are transparent to bare-name lookup.

## Path lookup

A path atom carries a sequence of segments. Each segment is one of: `'..'` (go up to parent), a name, or an integer.

To resolve a path at env `e`, start with the env's top frame (representing the AST node containing the path) and process segments in order:

1. `'..'` — pop one frame off `e` (move to the parent's frame). The resulting frame is the new "current frame".
2. a name — interpret it as a child name within the current frame's AST node: a record field, a let-block binding, or a call's argument, by keyword or by the name of the parameter in the head's signature.
3. an integer — interpret it as an index into a vector's elements. A call's arguments are reached by name, and a variadic parameter's name refers to the remaining arguments as a vector, which adds no level for paths inside them. Let-blocks are addressed by name only, so a let-block's trailing expression has no path. A path cannot descend into a function literal, and cannot appear in a function signature (a syntax error).

After processing all segments, the result is the evaluation node `(target_AST, env_at_target)`. When the path runs out of frames to pop (popping above top-level) or a name/integer fails to address a child, a diagnostic is emitted and the path yields `()`.

For a vector `[e0 e1 ...]`, indices are `0` = `e0`, `1` = `e1`, etc.

`env_at_target` is the env that the target AST would be evaluated in if reached by ordinary recursive descent from the top-level: walk the AST from top-level down to the target, pushing a frame at each scope-introducing form on the way:

- **Let-block** entered: push a frame whose bindings are the let-block's `name = value` pairs (with self-referential `parent`).
- **Top-level**: the host's initial env.

For path traversals that stay within scope-flat structures (records, vectors, applications), `env_at_target` equals the current env — no pop/push is needed.

If the parent walk takes the path above top-level, or a segment fails to address any child, emit a diagnostic and yield `()` (see [Failure as `()`](#failure-as-)).

Path navigation traverses the full AST tree; records, vectors, and applications participate (unlike bare-name lookup). Wrapping an expression in a vector therefore changes the dot-count required to reach an outer position.

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

### `~` during evaluation

`~` is **transparent during evaluation**: `eval` produces the same value as if it were not present, and it does not count as a level for paths. It only matters for `expand` (see [Multi-step evaluation](#multi-step-evaluation--abstraction-ladder)).

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

#### `IO`

Evaluation changes nothing: not the AST, not any env. An effect is a value of type `IO`, which the host runs when it chooses. Editing the environment is such an effect, and it produces a new let-block rather than changing a frame in place, so evaluation results stay valid and undo is a matter of restoring the old one. `name = expr` and `./path/seg = expr` in a REPL or application shell evaluate to this kind of `IO`. A name that does not exist yet is added to the let-block or record holding it.

The `IO` type itself is a brand on the deferred-effect value. `eval` treats `IO`-typed values like any other value (no implicit forcing); explicit `run` is the host's responsibility.

`IO` is parametric: `(IO T)` describes an IO whose `run` produces a `T`, and the bare `IO` is sugar for `(IO _)`. The runtime cannot inspect the payload without running the action, so any `IO` value satisfies any `(IO T)` slot at runtime; structural compatibility between two annotated `(IO T)` slots flows through the type checker (covariant in the payload). The annotation is informational today — there is no host-level bind or richer effect tracking yet — but the parametric form is in place so future combinators can be typed precisely.

## Multi-step evaluation / Abstraction ladder

A core design principle of Glisp: **every expression has an abstraction ladder** — a chain of progressively-more-evaluated forms with the same final value. Hosts (in particular visual / GUI editors) can show, edit, and reason at any rung.

A function's body is its next rung, so a definition states what the function is one level of abstraction down:

```glisp
circle  = (=> (c: vec2 r: number): Path (ellipse c [r r]))
ellipse = (=> (c: vec2 r: vec2): Path (path ...~(ellipse-segments c r)))

(circle [0 0] 10)                ;; rung 0: source
(ellipse [0 0] [10 10])          ;; rung 1
(path [10 0] [0 10] ...)         ;; rung 2: the segments are computed, how is not shown
<the Path value>                 ;; rung ∞: final value
```

This is the language analogue of "Expand Appearance" in vector graphics editors: any sub-form can be replaced by a more concrete form below it on the ladder, or its final value, without changing meaning.

### Two operations

```
eval:    (AST, Env) → Value
expand:  (AST, Env) → AST           ;; one step, returns the next rung
```

- `eval` produces the final value. `~` is transparent to it.
- `expand` performs one step. Repeated `expand` calls climb down the ladder.

Both operations agree on the final value: `eval(AST, env)` equals `eval(expand(AST, env), env)`.

### One step

- A call to a closure steps to the closure's body, with each parameter replaced by the argument expression as written. A `?` at the tail of the body resolves within the same step, so the rung is the selected clause.
- A bare `?` steps to its selected clause, or to `()` when none matches.
- A call to a host function steps to what its expansion says, if it has one (see [Host functions](#host-functions)).
- Everything else is a fixed point: literals, let-blocks, vectors, records, function literals, and other calls to host functions. `expand` returns the same node, and the value comes from `eval`.

Which sub-expression to step is up to the host. Stepping the argument first takes `(sq (+ 1 1))` to `(sq 2)`, without the function saying anything about it.

### `~` — work this out within the step

`~expr` marks an implementation detail. It is worked out during the step, so its intermediate forms never appear on the ladder. It is how a definition keeps recursion and helpers out of view.

Only what is needed gets computed, the same way lazy evaluation works:

- A condition of `?` and an argument to a host function are forced.
- An argument that is merely passed along stays as written.
- `~x` on a parameter asks for that argument itself, so it is forced.

```glisp
repeat = (=> (T) (v: T n: number): [...T]
             (? (== n 0) true [] _ [v ...(repeat v (- n 1))]))
pow    = (=> (x: number a: number): number (* ...~(repeat x a)))
sq     = (=> (x: number): number (* ~x ~x))

(pow (+ 1 1) (+ 1 2))            ;; a is needed, x is passed along
(* (+ 1 1) (+ 1 1) (+ 1 1))
8

(sq (+ 1 1))
(* 2 2)
4
```

`...~expr` is `...` applied to `~expr`: the result is inlined when it is a vector literal. A `~` inside a clause of a nested `?` waits until that clause is selected.

### Host functions

A host function has no body, so by default a call to it has no next rung: `expand` returns the same node, and the value comes from `eval`. It can say otherwise with `withExpansion`, which receives the argument expressions as written and a context for working out only those it needs. It returns the next rung, or null for none. `**` uses this, so `(** (+ 1 1) 3)` expands to `(* (+ 1 1) (+ 1 1) (+ 1 1))`, while `(** 2 0.5)` has no next rung.

### Termination of `expand`

A single call to `expand` always terminates. A `~` that recurses without end leaves the call unexpanded. A host iterating `expand` should stop when the result is the input (fixed point reached); `expandLadder` and `expandAll` do this, with a step limit as a guard against pathologically long ladders.

### Moving a body to the call site

- A name steps to the expression it is bound to, and means the same thing there. A name bound to a host value has no expression, so it is a fixed point, and so is one whose expression has a path in it, as a path is relative to where it is.

A body means the same thing after it moves:

- A free name in the body that the call site has shadowed embeds the value it had at the definition. A number, string or boolean is written out, and otherwise that rung prints it as `<closure>` or `<host-fn>`, so it does not round-trip to source.
- A binder in the body that would capture a free name of an argument is renamed: `{y = 1 (+ x y)}` with the argument `y` becomes `{y_1 = 1 (+ y y_1)}`.

A path inside an argument is not adjusted for its new depth, so such a rung may not agree with `eval`. This is an open problem.

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

`resolve(ast, env)` walks the AST and binds every bare name and path to its target against the surrounding scope structure, running nothing. References that fail become diagnostics with the same messages evaluating them would produce, including in branches and function bodies that never run. `check` reports them alongside type errors. Duplicate let bindings and record fields are reported as warnings, and the last one wins.

Scopes mirror the evaluator's frames: vectors, records, calls, and let-blocks each add a level, and a function literal adds one around its body. Generics are visible to a function's types and body; parameters to its body only, since a parameter's type is evaluated before any argument is bound.

`freeRefs(ast)` is the context-independent half: the bare names a node does not bind itself, and the paths that climb out of it. It depends on the node alone, so it is cached per AST instance. Since a node's value is determined by its own structure and what these refer to, it is the basis for incremental evaluation (see [Open questions](#open-questions)).

## Working backward

`solve` is evaluation in reverse: given a node and the value it should have, it makes the edit that gets there. Like any edit, it makes a new AST, and what is unchanged stays `===`.

It goes down from the node to a literal, the only thing it changes:

- A name goes to what it is bound to, and a path to what it lands on. Neither goes outside the root, so the prelude stays as it is.
- A vector or a record goes into each element or field whose value differs, and `a.x` into `a`. The shape has to stay the same.
- A let-block goes to what it gives. `(: v T)` and `~` go to what they hold.
- A call to a closure goes through its body, and a parameter leads to the argument as written. The literals of a function stay, since other calls share them.
- A call to a host function asks its inverse what an argument would have to be. See [Which argument changes](#which-argument-changes).

It stops at `@`, at a host function with no inverse, and for now at `?`, `|>` and `overload`.

### Which argument changes

Of a call's arguments, it tries a literal first, as that changes nothing else, and then a later one before an earlier one. `(+ a 1)` changes the `1`, `(+ a @1)` changes `a`, and `(+ a b)` changes `b`, or `a` if `b` cannot change. The first that works is the one, so a program steers it with `@`.

### What cannot add up

The result is checked by evaluating it. It fails, with a diagnostic, rather than give a wrong value when a name would need two values, as in `[x x]` wanted to be `[5 7]`, or when what it changes is used more than once, as in `(+ a a)`. Solving such constraints is not done yet.

A number it writes is rounded to 12 significant digits as long as the value still comes out, so that `(** @3 a)` wanted to be 81 gives `a` as `4`, and not `4.000000000000001`.

## Incremental evaluation

`Runtime` evaluates a root AST as the host replaces it. The host keeps an immutable AST and passes each version to `setRoot`.

A plain `evaluate` memoizes on `(AST instance, env instance)`. Replacing a node creates new ancestors and new env frames beneath them, so that alone would miss the cache for the whole tree. `Runtime` keys results on a **signature** instead:

```
signature(node, env) = (content of node, signature of each thing it refers to)
```

- **Content** is the structure, ignoring identity, trivia, and metadata other than `default`, which is the only metadata evaluation reads. So changing a `label` recomputes nothing, and neither does changing what only metadata refers to, reformatting, or reparsing unchanged text.
- **What a node refers to** comes from `evaluatedRefs`, which is `freeRefs` apart from what only metadata refers to, with each name and path resolved in `env`. A dependency that fails to resolve contributes that fact.
- **Bindings can form cycles.** A strongly connected component gets one signature for the group as a whole. A cycle of function literals is ordinary recursion. A cycle through anything else is a value depending on itself, whose result depends on where the cycle was entered, so neither it nor anything depending on it is cached.

This has the following consequences for a host:

- An edit recomputes what depends on it. Everything else returns the same JS value, so an unchanged value is `===` across edits.
- Restoring an earlier root is an undo served from the cache, as long as its entries have not been evicted.
- Host functions must be pure, since a cached result outlives the root it was computed for. Values must not be mutated, since they may be shared between positions.
- A cached diagnostic's `source` is the node that produced it first, which may belong to an earlier root.
- A cached closure keeps the frame it captured, and through it that root, for as long as the entry lives.

**Lifetime.** `Runtime` owns its cache. Each `setRoot` starts a generation, using an entry marks it and everything it was computed from, and entries beyond `maxEntries` are evicted oldest first and cheapest first. Frames inside a function call are short-lived, so a result computed there is kept only if it took at least `heavyMs`.

## Open questions

- **Default fallback propagation**: when a sub-expression's evaluation falls back to a default value, how does the diagnostic propagate up the surrounding expression?
