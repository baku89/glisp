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
| `g.vector(T)`                        | `(vector T)` type             | value       | `g.vector(g.number)`                                          |
| `g.enum(...vs)`                      | `(enum v1 v2 ...)` type       | value       | `g.enum('round', 'butt')`                                     |
| `g.record({ k: ... })`               | record type **or** record AST | overload    | see below                                                     |
| `g.fn({ name: T, ... }).returns(R)`  | function type                 | value       | see below                                                     |
| `... .body(expr)`                    | function literal AST          | AST         | continues from `.returns(R)`                                  |

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

Function-type parameters are taken as an **object literal**: keys are parameter names, values are parameter types. Insertion order is the parameter order. Parameter names are part of the function type — see [Function literal](./syntax.md#function-literal).

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

const env = g.prelude
  .with('add', addType, (a, b) => a + b)
  .with('mul', mulType, (a, b) => a * b)
```

Each `.with(...)` returns a **new env value**; the parent env is unchanged. Envs are first-class JS values: multiple envs can coexist for parallel evaluations, scoped extensions, A/B comparisons, etc.

`g.prelude` is the parentless root env that ships with Glisp's built-in operations (`+`, `-`, `*`, `?`, `|>`, `vector`, ...). Any user-built env derives from it (or from `g.emptyEnv()` if the host wants to start from nothing).

This API mirrors [eval.md](./eval.md#environment)'s frame chain: `g.prelude` is the root frame, each `.with(...)` extends with one more top-level binding.

### Bindings

`.with(name, type, value)` is the single-binding form, with three positional arguments. There is no `{type, fn}` struct: the same shape covers functions and constants alike.

```ts
const env = g.prelude
  // function
  .with('add',
        g.fn({ a: g.number, b: g.number }).returns(g.number),
        (a, b) => a + b)
  // numeric constant
  .with('pi', g.number, 3.14159)
  // record value
  .with('config',
        g.record({ port: g.number, host: g.string }),
        { port: 8080, host: 'localhost' })
  // enum value
  .with('mode', g.enum('debug', 'release'), 'release')
```

`.withAll({...})` registers multiple bindings at once, as `[type, value]` tuples:

```ts
const numFn = g.fn({ a: g.number, b: g.number }).returns(g.number)

const env = g.prelude.withAll({
  add: [numFn, (a, b) => a + b],
  mul: [numFn, (a, b) => a * b],
  pi:  [g.number, 3.14159],
})
```

- `type` is the binding's Glisp type, built via value builders (preferred — enables TS inference) or via `g.parse(string)`.
- `value` is any JS value that marshals to the declared type. For function bindings, it's a plain JS function — no wrappers needed. The TS type of `value` must satisfy `g.infer<typeof type>`, otherwise it's a compile-time error.

The type is always required — there is no inference-from-value shortcut. This keeps the host API symmetric with Glisp's "types are always explicit" stance for function definitions.

All metadata (`label`, `doc`, `default`, ...) attaches to the type itself via `^{...}`.

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

## Opaque host values

Any JS value that does not correspond to a Glisp built-in type can still flow through Glisp as an opaque value. From Glisp's perspective such values inhabit `top` and have no introspectable structure; they pass through unchanged.

Hosts can declare a named opaque type to enable casting and type-checking:

```ts
const DateType = g.declareOpaque<Date>('Date', {
  guard: (v): v is Date => v instanceof Date,
  default: new Date(0),
})

const env = g.prelude.bind('today', {
  type: g.fn({}).returns(DateType),
  fn: () => new Date()
})
```

- `guard` is the runtime predicate used at cast sites (`(Date v)` validates and returns `v` if `guard(v)` is true).
- `default` is the standard metadata default returned on cast failure.
- The first type argument to `declareOpaque` is the TS type, used by `g.infer` so that opaque values flow through with their JS static type intact.

Convention: opaque types are named with an uppercase initial (`Date`, `URL`, `Map`), per the [naming convention](./types.md#naming-convention).

## Functions across the boundary

Both directions are automatic:

- **Host → Glisp**: bind a JS function. Inside Glisp it is callable like any other function value.
- **Glisp → host**: a Glisp Closure surfaced to JS is a callable JS function. Calling it forces evaluation in the closure's captured env and returns a JS value.
- **JS callbacks passed into Glisp**: a JS function passed as an argument is callable from Glisp directly. Glisp does not introspect the JS function's parameter list; the receiving slot's declared type is what's checked.

## Open questions

- **Diagnostics API surface**: how `glisp.diagnose` returns the diagnostic set, query by sub-AST, severity filtering, etc.
- **Prelude boundary**: which functions are defined in Glisp source (Prelude) vs. host-bound primitives. Numeric ops (`+`, `*`, `<`) are likely host-bound; higher-order helpers (`map`, `filter`, `reduce`) are written in Glisp.
- **Module / multi-file structure**: a single evaluable program vs. a module system with imports/exports. Affects whether `.bind` extends top-level or pushes a new frame.
- **Incremental / differential evaluation**: how the host signals AST changes and what the host receives in return.
- **Bidirectional evaluation**: editing a result, inferring the corresponding input.
