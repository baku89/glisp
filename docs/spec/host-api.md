# Glisp Host API

The host is the JS/TS application embedding Glisp. This document specifies how the host exchanges values with Glisp, constructs Glisp ASTs and types from the host side, and assembles environments in which Glisp programs are evaluated.

## Core principle: runtime values are plain JS

After evaluation, a Glisp value is the corresponding plain JS value, with no wrapper layer. Marshaling is automatic in both directions.

| Glisp value         | JS representation                                  |
| ------------------- | -------------------------------------------------- |
| `number`            | `number`                                           |
| `string`            | `string`                                           |
| `boolean`           | `boolean`                                          |
| `unit` (`()`)       | `Symbol.for('glisp.unit')`                         |
| `vector`            | `Array`                                            |
| `record`            | plain `object` (string keys)                       |
| Closure             | callable `function`                                |
| Type                | callable `function` (cast) with marker property    |
| `ast` (quoted form) | AST handle                                         |

`unit` is a registered Symbol rather than `null`/`undefined`, so it cannot be confused with JS values of those forms (e.g. JSON parse results, missing object keys). The Symbol is stable across modules via `Symbol.for`.

`ast`-typed values (results of quasiquoted forms, macro inputs/outputs) appear in JS as **AST handles**. The same handle plays a dual role in the host API: it can be used as an AST under construction (a child of `g.call`, `g.vec`, etc.) **and** as a runtime value of Glisp type `ast`. There is no separate "AST value" wrapper.

## Builders — `g.*`

The `g` namespace contains all the builders for ASTs and values. Two flavors live in the same namespace:

- **AST builders** produce raw AST handles (no env resolution). Used to construct Glisp source programmatically, splice into quasiquotes, or as runtime `ast`-typed values.
- **Value builders** produce values whose meaning is fully resolved on the TS side. Used as the `type` of a binding and as inputs to `g.infer<T>`.

| Builder                              | Returns                       | Flavor      | Example                                                       |
| ------------------------------------ | ----------------------------- | ----------- | ------------------------------------------------------------- |
| `g.parse(source)`                    | AST                           | AST         | `g.parse('(+ 1 2)')`                                          |
| `g.lit(jsValue)`                     | literal AST                   | AST         | `g.lit(42)` → `42`                                            |
| `g.sym(name)`                        | symbol AST                    | AST         | `g.sym('+')` → `+`                                            |
| `g.call(head, ...args)`              | application AST               | AST         | `g.call(g.sym('+'), g.lit(1), g.lit(2))` → `(+ 1 2)`          |
| `g.vec(...elements)`                 | vector AST                    | AST         | `g.vec(g.lit(1), g.lit(2))` → `[1 2]`                         |
| `g.path(dots, ...segments)`          | path AST                      | AST         | `g.path(2, 'width')` → `../width`                             |
| `g.quote(expr)`                      | quasiquote AST                | AST         | `g.quote(g.lit(1))` → `` `1 ``                                |
| `g.unquote(expr)`                    | unquote AST                   | AST         | `g.unquote(g.sym('x'))` → `~x`                                |
| `g.splice(expr)`                     | splice AST                    | AST         | `g.splice(g.sym('xs'))` → `...~xs`                            |
| `g.number`                           | the `number` type             | value       | `g.number`                                                    |
| `g.string`                           | the `string` type             | value       | `g.string`                                                    |
| `g.boolean`                          | the `boolean` type            | value       | `g.boolean`                                                   |
| `g.unit`                             | the `unit` type               | value       | `g.unit`                                                      |
| `g.top`                              | the `_` (top) type            | value       | `g.top`                                                       |
| `g.bottom`                           | the `!` (bottom) type         | value       | `g.bottom`                                                    |
| `g.ast`                              | the `ast` type                | value       | `g.ast` — used to type macro arguments                        |
| `g.vector(T)`                        | `[...T]` type                 | value       | `g.vector(g.number)`                                          |
| `g.enum(...vs)`                      | `(enum v1 v2 ...)` type       | value       | `g.enum('round', 'butt')`                                     |
| `g.record({ k: ... })`               | record type **or** record AST | overload    | see below                                                     |
| `g.fn({ name: T, ... }).returns(R)`  | function type                 | value       | see below                                                     |
| `... .body(expr)`                    | function literal AST          | AST         | continues from `.returns(R)`                                  |
| `g.generic(['T', ...], cb)`          | generic value                 | value       | see below                                                     |

### Overloaded builders

Two builders accept arguments that decide their flavor:

**`g.record({ key: ... })`** — overload by argument flavor:

```ts
g.record({ x: g.number })          // all values → record TYPE: {x: number}
g.record({ x: g.lit(10) })          // all ASTs   → record AST:  {x: 10}
g.record({ x: g.number,
           y: g.lit(10) })          // mixed      → TS error
```

The TS type system enforces "all-values" or "all-ASTs"; mixing is rejected at compile time.

**`g.fn(...)`** — staged builder:

```ts
g.fn({ a: g.number, b: g.number })
//   ↓ FnParamsBuilder — params only; not yet usable

  .returns(g.number)
//   ↓ FnTypeOrBody — function TYPE value (usable as `type` field, in g.infer, etc.)
//                    .body(expr) optionally continues to make it an AST instead

  .body(g.call(g.sym('+'), g.sym('a'), g.sym('b')))
//   ↓ FnAST — function literal AST (=> (a: number b: number): number (+ a b))
```

The chain has three stages. Stopping at `.returns(R)` yields the function-type value. Continuing with `.body(expr)` yields the function-literal AST. `g.fn(params)` alone is a non-final intermediate and cannot be passed as a `type` (TS type-checks this).

Function-type parameters are taken as an **object literal**: keys are parameter names, values are parameter types. Insertion order is the parameter order. Parameter names are required at the syntax level but do not affect type identity (see [Function-type equality](./types.md#function-type-equality)).

### Generics — `g.generic`

`g.generic(['T', 'U', ...], callback)` introduces type variables. The callback receives the type variables as a record and returns the type that uses them:

```ts
const indexer = g.generic(['T'], ({ T }) =>
  g.fn({ xs: g.vector(T), i: g.number }).returns(T)
)

type Indexer = g.infer<typeof indexer>
//   = <T>(xs: T[], i: number) => T

// multiple type variables
const swap = g.generic(['T', 'U'], ({ T, U }) =>
  g.fn({ a: T, b: U }).returns(g.record({ x: U, y: T }))
)
```

Inside the callback, type variables are first-class values usable wherever a value-builder is expected. They are inferred at call sites in Glisp, exactly like Glisp's own generic functions ([Generics](./types.md#generics)).

### `g.lit` vs `g.sym`

`g.lit` distinguishes JS primitive types automatically: `g.lit(42)` produces a number literal, `g.lit("hi")` a string literal, `g.lit(true)` a boolean literal. It always wraps a value, never an identifier — for identifiers, use `g.sym`.

### Metadata

Attach metadata to any value via `.meta(...)`:

```ts
const Width = g.number.meta({ default: 100, label: 'Width' })
// runtime-equivalent: ^{default: 100 label: "Width"} number
```

Metadata layers as specified in [types.md](./types.md#metadata).

## TS static-type inference: `g.infer<T>`

`g.infer<T>` is a TypeScript conditional type that maps a **value** (built via value builders) to its corresponding TS static type. It is undefined for raw AST handles.

```ts
const userType = g.record({ name: g.string, age: g.number })
type User = g.infer<typeof userType>
//   = { name: string; age: number }

const fnType = g.fn({ x: g.number }).returns(g.string)
type Fn = g.infer<typeof fnType>
//   = (x: number) => string

const colors = g.enum('red', 'green', 'blue')
type Color = g.infer<typeof colors>
//   = 'red' | 'green' | 'blue'

const points = g.vector(g.record({ x: g.number, y: g.number }))
type Points = g.infer<typeof points>
//   = { x: number; y: number }[]

type AnyAST = g.infer<typeof g.ast>
//   = ASTHandle (an opaque branded type)
```

For function types, `g.infer` produces a positional JS function whose parameter names match the value-builder's keys. `unit` infers to `typeof g.unit` (the registered Symbol).

## Environments

The host assembles a Glisp environment by deriving from the prelude (or any other env) via **immutable extension**. There is no global mutable state, no install-time side effect.

```ts
const empty = g.emptyEnv()                     // env with no bindings (testing / sandbox)
const prelude = g.prelude                      // the standard env Glisp ships with
```

`g.prelude` is the parentless root env that ships with Glisp's built-in operations (`+`, `-`, `*`, `?`, `|>`, `vector`, ...). Any user-built env derives from it (or from `g.emptyEnv()` if the host wants to start from nothing).

### Bindings

`.with({...})` extends an env with one or more bindings, returning a new env. Each entry's value is either a plain JS value (whose type is inferred) or a `g.def(type, value)` marker (where the type is declared explicitly).

```ts
const env = g.prelude.with({
  // type-inferred from JS value
  pi: 3.14159,                                       //  → number
  greeting: "hello",                                  //  → string
  flags: true,                                        //  → boolean
  palette: ['red', 'green', 'blue'],                  //  → [...string]
  config: { port: 8080, host: 'localhost' },          //  → {port: number, host: string}

  // explicit type via g.def — required for functions, optional otherwise
  add: g.def(
    g.fn({ a: g.number, b: g.number }).returns(g.number),
    (a, b) => a + b
  ),
  mode: g.def(g.enum('debug', 'release'), 'release'),  // override the default 'string' inference
})
```

#### When inference suffices

For most JS values, the Glisp type is uniquely determined by the value:

| JS value                       | Inferred Glisp type                 |
| ------------------------------ | ----------------------------------- |
| `42`, `3.14`                   | `number`                            |
| `"hello"`                      | `string`                            |
| `true`, `false`                | `boolean`                           |
| `Symbol.for('glisp.unit')`     | `unit`                              |
| `[1, 2, 3]`                    | `[...number]`                       |
| `{x: 10, y: 20}`               | record `{x: number, y: number}`     |

These can be passed as plain JS — no wrapper needed.

#### When `g.def` is required

A JS function carries no Glisp-type information at runtime: parameter and return types are not visible. Functions therefore must be wrapped with `g.def(type, value)` to declare their Glisp type:

```ts
add: g.def(
  g.fn({ a: g.number, b: g.number }).returns(g.number),
  (a, b) => a + b
)
```

#### When `g.def` is optional but useful

Use `g.def` whenever the inferred type is wrong or under-specified for the binding's intended role:

- An `enum`-typed constant: `g.def(g.enum('debug', 'release'), 'release')` instead of plain `'release'` (which infers to `string`).
- A value that should carry metadata: `g.def(g.number.meta({label: 'Width', default: 100}), 100)`.
- An `ast`-typed value held as a TS-side `AST` handle: when the inference would not pick `ast`.

#### Semantics

- `type` is the binding's Glisp type, built via value builders (preferred — enables TS inference) or via `g.parse(string)`.
- `value` (whether wrapped or plain) must satisfy `g.infer<typeof type>` — TS catches mismatches at compile time.
- `.with({...})` returns a new env; the original is unchanged. Multiple `.with` calls can be chained to layer additional scopes.
- All metadata attaches to the type itself via `^{...}` or `.meta(...)` — no separate metadata field on the binding.

#### Shadowing

When a `.with({...})` defines a name that is already bound in the parent env, the new binding **shadows** the parent — the derived env sees the closer binding, the parent env is unchanged. This is silent, no diagnostic.

```ts
const env1 = g.prelude.with({ pi: 3.14 })
const env2 = env1.with({ pi: 3.14159 })     // env2 sees pi = 3.14159
const env3 = env1.with({ tau: 6.28 })       // env3 sees pi = 3.14, tau = 6.28
// env1 itself remains unchanged: pi = 3.14
```

This is the standard lexical-scope behavior — name-lookup walks frames innermost-first per [eval.md](./eval.md#bare-name-lookup).

Within a single `.with({...})` record, a duplicate JS object key is a JS-level concern (object literals last-key-wins, often flagged by linters); the host API receives only the final entry.

This API mirrors [eval.md](./eval.md#environment)'s frame chain: `g.prelude` is the root frame, each `.with({...})` extends with another set of top-level bindings.

## Evaluation

```ts
glisp.eval(ast, env)        // → JS-native value
glisp.expand(ast, env)      // → AST (one expansion step, per eval.md)
glisp.resolve(ast, env)     // → resolved binding for a symbol/path AST
glisp.diagnose(ast, env)    // → diagnostic set produced by this evaluation node
```

Each takes the AST and the env explicitly. There is no implicit "global env"; the host always supplies one.

The `ast` argument does not need to be a structural descendant of any AST referenced by `env`. The env is purely the *scope context* used for name and path resolution; physical containment in some larger AST tree is irrelevant. This means the host can:

- Evaluate any sub-expression of a parsed program by handing in just that node along with an env that captures its enclosing scope.
- Evaluate the same AST under multiple different envs (e.g. with shadowed bindings) without rebuilding the AST.
- Synthesize an AST on the fly via builders and evaluate it against an existing env.

See [eval.md](./eval.md#environment) for the underlying frame-chain model.

## Reflection

Two utilities help GUI-style hosts work with values and positions in an AST.

### `g.toAst(value, env)` — value → AST

Reverse-direction conversion: given a Glisp value and an env, produce an AST whose evaluation against `env` yields the same value.

```ts
g.toAst(42, env)              // → AST: 42 (number literal)
g.toAst([1, 2, 3], env)       // → AST: [1 2 3]
g.toAst({x: 10, y: 20}, env)  // → AST: {x: 10 y: 20}
g.toAst(piValue, env)         // → AST: pi  (if env binds pi to that value)
g.toAst(g.number, env)        // → AST: number (the bare symbol from the prelude)
```

The result satisfies `eval(g.toAst(v, env), env) ≡ v` (modulo marshaling and equality).

Conversion strategy by value kind:

| Value kind          | Reified AST                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `number`/`string`/`boolean`/`unit` | corresponding literal                              |
| vector              | `[...]` AST, elements reified recursively                          |
| record              | `{...}` AST, field values reified recursively                      |
| Closure             | the function literal AST stored in the closure                     |
| Type                | a bare symbol if env binds it; otherwise built structurally (`[...T]`, `{x: T}`, `(=> (a: T): R)`, etc.) |
| AST handle (`ast`-typed value) | a quasiquoted form `` `expr ``                          |
| Extern value (`g.extern`-typed) | the value of the extern type's `toAst` option (see below) |

When multiple bindings in `env` resolve to the same value, the implementation picks the first found by lookup order; the choice is otherwise unspecified.

For an extern-typed value, the host **must** provide the conversion via the extern type declaration. Without it, `g.toAst` cannot construct an AST — the call emits a diagnostic and yields the unit AST as a fallback.

### `g.expectedTypeAt(parentAst, position, env)` — slot's expected type

What type should fit in this AST slot? Answers that question without requiring the slot's current contents to actually have that type.

```ts
type Position = string | number | (string | number)[]

g.expectedTypeAt(parentAst, position: Position, env): TypeHandle
```

- `parentAst`: the AST whose interior slot we are asking about.
- `position`: the slot identifier inside `parentAst`:
  - a `string` is a field name (`'body'`, `'x'`, `'returnType'`, etc.)
  - a `number` is a positional index (`0` for the first argument of a call, `1` for the second element of a vector, etc.)
  - a `(string | number)[]` is a structured path that descends through nested slots (e.g. `['params', 0, 'type']`)
- `env`: the env in which `parentAst` is evaluated. Needed because slot types may reference type values pulled from env-bound names.

`Position` is a host-API navigation aid, not a Glisp `path` AST. It addresses "which slot inside this parent" from the TS side; Glisp's `g.path` (`./foo`, `../bar`) addresses positions inside a running program, with a different starting point and dot-counting rule.

```ts
// parentAst = (=> (x: number y: number): number body)
g.expectedTypeAt(parentAst, 'body', env)
//   → number  (the body must produce the declared return type)

// parentAst = (f a b), f : (=> (x: number y: number): number)
g.expectedTypeAt(parentAst, 1, env)
//   → number  (arg 0 is 'a' for x)

// parentAst = {x: 10 y: 20}  in a slot expecting {x: number y: number}
g.expectedTypeAt(parentAst, 'x', env)
//   → number
```

This is required because `eval(ast, env)` decouples ast from env's structural lineage — there is no inherent "where in the tree am I" for a free-floating ast. To ask about a position, the host names the parent and the slot.

The expected type is computed statically from the parent's type (the head's signature, the receiving record/tuple type, the function's return-type slot, etc.). When the parent itself has no constraint (e.g. a let-block binding's right-hand side, or any expression position not flowing into a typed slot), the result is `top` — anything is accepted.

This is the API GUI tooling calls when displaying completion, type hints, or wiring suggestions for a cursor position.

### `g.print(ast)` — AST → source string

Renders an AST back to Glisp source text. Combined with `g.toAst`, it produces a `value → source` round-trip.

```ts
g.print(g.parse('(+ 1 2)'))             // → "(+ 1 2)"
g.print(g.toAst({x: 10, y: 20}, env))   // → "{x: 10 y: 20}"
```

Trivia handling:

- An AST originating from `g.parse` retains its inter-position trivia (whitespace, comments), so `g.print(g.parse(s))` reproduces `s` verbatim.
- An AST originating from builders has no trivia, so `g.print` formats it with default whitespace consistent with the rules in [syntax.md](./syntax.md).

The Glisp language can also expose a `print` function callable as `(print value)`. It is a host binding, conventionally:

```ts
print: g.def(
  g.fn({v: g.top}).returns(g.string),
  (v) => g.print(g.toAst(v, env))
)
```

The TS `g.print` and the Glisp-level `print` share a name but live on different layers — one is a host utility on ASTs, the other is a function value bound in the Glisp environment that operates on values. Whether `print` ships in the standard prelude is part of the Prelude-boundary question (see Open questions).

## External types

Any JS value that does not correspond to a Glisp built-in type can flow through Glisp via an externally-declared type. From Glisp's perspective such values inhabit a named external type whose internals are not introspectable; they pass through unchanged.

`g.extern` declares such a type. The same API covers both **monomorphic** types (`Date`) and **generic** type constructors of arity 1 (`Observable<T>`):

```ts
// monomorphic
const DateType = g.extern<Date>('Date', {
  guard: (v): v is Date => v instanceof Date,
  default: new Date(0),
  toAst: (d) => g.call(g.sym('Date.parse'), g.lit(d.toISOString())),
})

// generic (1-argument type constructor)
const Observable = g.extern<Observable<any>>('Observable', {
  arity: 1,
  guard: (v): v is Observable<any> => v instanceof Observable,
  default: <T>() => EMPTY as Observable<T>,
  // toAst omitted — Observable values are stream-like and cannot be losslessly serialized to an AST
})

const env = g.prelude.with({
  today: g.def(g.fn({tick: g.unit}).returns(DateType), () => new Date()),
  numbers: g.def(Observable(g.number), of(1, 2, 3)),
  names:   g.def(Observable(g.string), of('a', 'b')),
})
```

### TS inference for `g.extern`

The TS type argument is propagated by `g.infer`:

- **Monomorphic**: `g.infer<typeof DateType>` is `Date`.
- **Generic**: `g.infer<typeof Observable(g.number)>` is `Observable<number>`. The element type is captured at the call to `Observable(...)` and woven into the JS type via TS's higher-rank generics.

Concretely, the generic form of `g.extern<JSCtor>(name, options)` returns a function `(t: TypeHandle<T>) => ExternTypeHandle<JSCtor with T substituted>`, so calling `Observable(g.number)` yields a handle whose inferred TS type is `Observable<number>`. This enables the `bind` site's `value` to be type-checked against the parameterized form (`fn: () => Observable<number>` rather than `() => Observable<any>`).

### Semantics

- `guard` is the runtime predicate used at cast sites (`(Date v)` validates and returns `v` if `guard(v)` is true).
- `default` is the metadata default returned on cast failure. For generic types, `default` is a parametrized factory.
- `toAst` (optional) maps a JS value of this type to an AST whose evaluation reproduces the value. Used by `g.toAst` (see [Reflection](#reflection)). Without it, `g.toAst` cannot serialize values of this extern type and emits a diagnostic.
- `arity: 1` makes the result a unary type constructor. Without `arity` (or `arity: 0`), the type is monomorphic.
- Generic types compare by **name + identity of the type argument**. The runtime `guard` checks only the JS class — element-type validity is the host's responsibility (a `Observable<number>` cast can't verify the stream actually emits numbers).
- Higher arities (`arity >= 2`) are not currently supported. If a multi-parameter generic is needed, the host can compose with records or wrap with another generic.

Whether to provide `toAst` is up to the host. Self-describing values (`Date`, `URL`, plain data wrappers) are typically convertible. Effectful or stream-like values (`Observable`, file handles, sockets) generally are not.

Convention: external types are named with an uppercase initial (`Date`, `URL`, `Map`, `Observable`), per the [naming convention](./types.md#naming-convention).

## Function overloading

A single name can dispatch to one of several implementations based on argument types. `g.overload` collects multiple `[type, value]` pairs into a single overloaded function:

```ts
const vec2 = g.record({ x: g.number, y: g.number })

const env = g.prelude.with({
  '+': g.overload(
    [g.fn({a: g.number, b: g.number}).returns(g.number),
     (a, b) => a + b],
    [g.fn({a: vec2, b: vec2}).returns(vec2),
     (a, b) => ({ x: a.x + b.x, y: a.y + b.y })],
  )
})
```

Dispatch rule: at a call site `(+ a b)`, the evaluator scans the overload candidates **in declared order** and picks the first whose parameter types accept the actual arguments (i.e. each argument casts successfully against the candidate's parameter type). If none match, the call falls back per the standard type-mismatch handling.

Authors are responsible for ordering candidates from most-specific to least-specific. Putting a broad signature (e.g. parameters typed `_`) first would shadow narrower ones below it.

This is the same dispatch shape as `?` (match): linear scan, first match wins, no "most-specific" ranking. The evaluator runs one algorithm for both forms.

### TS inference for `g.overload`

`g.infer<typeof overloadValue>` produces an **intersection of the candidate function types** — exactly TS's representation of an overloaded function:

```ts
const plus = g.overload(
  [g.fn({a: g.number, b: g.number}).returns(g.number), (a, b) => a + b],
  [g.fn({a: vec2, b: vec2}).returns(vec2), addVec2],
)

type Plus = g.infer<typeof plus>
//   = ((a: number, b: number) => number) & ((a: vec2, b: vec2) => vec2)
```

TS's call-site type-checking picks the matching signature from the intersection. The `value` parts of the candidates must satisfy this intersection (each implementation matches its own signature; TS verifies this at `g.overload` call site).

In Glisp source, the same overload form is available as the `overload` special form:

```glisp
+ = (overload
      (=> (a: number b: number): number ...)
      (=> (a: vec2 b: vec2): vec2 ...))
```

## Functions across the boundary

Both directions are automatic:

- **Host → Glisp**: bind a JS function. Inside Glisp it is callable like any other function value.
- **Glisp → host**: a Glisp Closure surfaced to JS is a callable JS function. Calling it forces evaluation in the closure's captured env and returns a JS value.
- **JS callbacks passed into Glisp**: a JS function passed as an argument is callable from Glisp directly. Glisp does not introspect the JS function's parameter list; the receiving slot's declared type is what's checked.

### Captured environment of host-bound functions

A Glisp closure is conceptually `(function literal AST, captured env)`. For functions imported from the host via `g.def(fnType, jsFn)`, there is no Glisp body — the function body is the host's JS implementation. The captured env slot of such a closure is the **empty env** (the root sentinel above top-level).

The empty captured env is observably consistent:

- Argument evaluation happens in the **caller's** env, per [eval.md — Environment](./eval.md#environment), regardless of host or Glisp origin.
- Return values come back from JS directly; no env lookup is involved.
- `expand` cannot descend into a host-bound function's body (it is JS, not AST). An empty captured env reflects "nothing to traverse."

If a host-bound function needs lexical state (counters, caches, accumulators), the host writes a plain JS closure inside the bound JS function. Glisp does not provide a way to give a host-bound function an extended captured env.

## Open questions

- **Diagnostics API surface**: how `glisp.diagnose` returns the diagnostic set, query by sub-AST, severity filtering, etc.
- **Prelude boundary**: which functions are defined in Glisp source (Prelude) vs. host-bound primitives. Numeric ops (`+`, `*`, `<`) are likely host-bound; higher-order helpers (`map`, `filter`, `reduce`) are written in Glisp.
- **Module / multi-file structure**: a single evaluable program vs. a module system with imports/exports. Affects whether `.bind` extends top-level or pushes a new frame.
- **Incremental / differential evaluation**: how the host signals AST changes and what the host receives in return.
- **Bidirectional evaluation**: editing a result, inferring the corresponding input.
