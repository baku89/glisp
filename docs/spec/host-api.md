# Glisp Host API

The host is the JS/TS application embedding Glisp. This document specifies how the host exchanges values with Glisp, binds host functions into the Glisp environment, and constructs Glisp ASTs and types from the host side.

## Core principle: runtime values are plain JS

After evaluation, a Glisp value is the corresponding plain JS value, with no wrapper layer. Marshaling is automatic in both directions: a JS value handed to Glisp is interpreted as the matching Glisp value, and a Glisp value handed back to the host is the matching JS value.

| Glisp value      | JS representation                                  |
| ---------------- | -------------------------------------------------- |
| `number`         | `number`                                           |
| `string`         | `string`                                           |
| `boolean`        | `boolean`                                          |
| `unit` (`()`)    | `Symbol.for('glisp.unit')`                         |
| `vector`         | `Array`                                            |
| `record`         | plain `object` (string keys)                       |
| Closure          | callable `function`                                |
| Type             | callable `function` (cast) with marker property    |
| AST (`` `expr ``)| opaque AST handle (separate kind)                  |

`unit` is a registered Symbol rather than `null` or `undefined`, so it cannot be confused with JS values of those forms (e.g. JSON parse results, missing object keys). The Symbol is stable across modules via `Symbol.for`.

## Bindings

`glisp.bind(name, { type, fn })` exposes a host value to Glisp under `name`:

```ts
glisp.bind('add', {
  type: g.fn(g.number, g.number).returns(g.number),
  fn: (a, b) => a + b
})
```

- `name`: the identifier the value is bound to in the Glisp environment.
- `type`: a Glisp **type value**, built either via type combinators (preferred — enables TS inference) or via `g.parse(string)` (returns an AST that gets evaluated internally).
- `fn`: the JS implementation. Plain JS function — no marshaling wrappers required. Glisp passes JS-native values as arguments and receives a JS-native value as the result.

Because the type is a Glisp value, all metadata (`label`, `doc`, `default`, etc.) attaches to the type itself via the standard `^{...}` mechanism — there is no separate metadata field on the binding.

## Two construction paths: AST vs. type values

The host has two ways to express Glisp expressions/types in TS, with different trade-offs:

| Path                    | Returns           | Env-resolved? | `g.infer` applicable? |
| ----------------------- | ----------------- | ------------- | --------------------- |
| `g.parse(string)`       | AST               | No            | No                    |
| AST builders (below)    | AST               | No            | No                    |
| Type combinators (below)| **Type value**    | Yes           | Yes                   |

The distinction matters because:

- An **AST** is a syntactic tree. A symbol like `Person` or `(vector Person)` cannot be resolved to a type without an environment — the AST is just sitting there waiting to be evaluated.
- A **type value** is the result of evaluating a type expression. It is self-contained on the TS side: `g.number` is the literal type value, `g.vector(g.number)` composes value-level pieces, and no Glisp env lookup is needed.

`g.infer<T>` operates on type values only, because that is where the TS side has enough information to derive a static type. AST handles do not carry resolution.

`bind` accepts either: a type value is used directly; an AST is evaluated internally to obtain a type value.

### AST builders (no TS inference)

These produce raw AST handles. Useful for building Glisp source programmatically (macros, code generation, splicing into quasiquotes), but not for declaring types to `bind`.

| Builder                                | Produces                | Example                                                              |
| -------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `g.lit(value)`                         | literal AST             | `g.lit(42)` → `42`                                                   |
| `g.sym(name)`                          | symbol AST              | `g.sym('+')` → `+`                                                   |
| `g.call(head, ...args)`                | application AST         | `g.call(g.sym('+'), g.lit(1), g.lit(2))` → `(+ 1 2)`                 |
| `g.vec(...elements)`                   | vector AST              | `g.vec(g.lit(1), g.lit(2))` → `[1 2]`                                |
| `g.record({ k: v, ... })`              | record AST              | `g.record({ x: g.lit(10) })` → `{x: 10}`                             |
| `g.fn(params).returns(T).body(expr)`   | function literal AST    | see below                                                            |
| `g.path(dots, ...segments)`            | path AST                | `g.path(2, 'width')` → `../width`                                    |
| `g.quote(expr)`                        | quasiquote AST          | `g.quote(g.lit(1))` → `` `1 ``                                       |
| `g.unquote(expr)`                      | unquote AST             | `g.unquote(g.sym('x'))` → `~x`                                       |
| `g.splice(expr)`                       | unquote-splice AST      | `g.splice(g.sym('xs'))` → `...~xs`                                   |

`g.lit` distinguishes JS primitive types automatically: `g.lit(42)` produces a number literal, `g.lit("hi")` a string literal, `g.lit(true)` a boolean literal. This is unambiguous because `g.lit` always wraps a value, never an identifier — for identifiers, use `g.sym`.

### Type combinators (TS inference)

These produce **type values** — TS-side handles that are already resolved and ready to drive `g.infer<T>`. Primitive types are exposed as constants; compound types are produced by composition.

| Combinator                            | Produces (type value)                     |
| ------------------------------------- | ----------------------------------------- |
| `g.number`                            | the `number` type                         |
| `g.string`                            | the `string` type                         |
| `g.boolean`                           | the `boolean` type                        |
| `g.unit`                              | the `unit` type                           |
| `g.top`                               | the `_` (top) type                        |
| `g.bottom`                            | the `!` (bottom) type                     |
| `g.vector(T)`                         | `(vector T)`                              |
| `g.enum(...values)`                   | `(enum v1 v2 ...)`                        |
| `g.fn(...paramTypes).returns(T)`      | function type                             |
| `g.record({ key: T, ... })`           | record type                               |

Type combinators only accept other type values as arguments — they cannot consume raw ASTs. This keeps the input to `g.infer` always env-free.

### Metadata

Attach metadata to any type value via `.meta(...)`:

```ts
const Width = g.number.meta({ default: 100, label: 'Width' })
// runtime-equivalent: ^{default: 100 label: "Width"} number
```

Metadata layers as specified in [types.md](./types.md#metadata).

## TS static-type inference: `g.infer<T>`

`g.infer<T>` is a TypeScript conditional type that maps a **type value** (a TS-side handle constructed via type combinators) to its corresponding TS static type. It is undefined for raw AST handles.

```ts
const userType = g.record({ name: g.string, age: g.number })
type User = g.infer<typeof userType>
//   = { name: string; age: number }

const fnType = g.fn(g.number).returns(g.string)
type Fn = g.infer<typeof fnType>
//   = (a: number) => string

const colors = g.enum('red', 'green', 'blue')
type Color = g.infer<typeof colors>
//   = 'red' | 'green' | 'blue'

const points = g.vector(g.record({ x: g.number, y: g.number }))
type Points = g.infer<typeof points>
//   = { x: number; y: number }[]
```

`glisp.bind` uses this to type-check the `fn`: the function's signature must match `g.infer<typeof type>`, otherwise TS reports a compile-time error.

```ts
// ✗ TS error: fn must be (a: number, b: number) => number
glisp.bind('add', {
  type: g.fn(g.number, g.number).returns(g.number),
  fn: (a: string) => a
})
```

Symbol unit: `g.infer<typeof g.unit>` is the type of `Symbol.for('glisp.unit')`.

## Opaque host values

Any JS value that does not correspond to a Glisp built-in type can still flow through Glisp as an opaque value. From Glisp's perspective such values inhabit `top` and have no introspectable structure; they can be passed around and returned to the host unchanged.

Hosts can declare a named opaque type to enable casting and type-checking:

```ts
const DateType = glisp.declareOpaque<Date>('Date', {
  guard: (v): v is Date => v instanceof Date,
  default: new Date(0),
})

glisp.bind('today', {
  type: g.fn().returns(DateType),
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
- **Glisp → host**: a Glisp Closure exposed to JS is a callable JS function. Calling it forces evaluation in the closure's captured environment and returns a JS value.
- **JS callbacks passed into Glisp**: a JS function passed as an argument is callable from Glisp directly. (Glisp does not introspect the function's parameter list; the binding's declared type at the receiving slot is what's checked.)

## Open questions

- **Evaluation API surface**: what does the host call to evaluate a top-level form, evaluate any sub-AST, run `expand` for ladder navigation, run static name resolution, etc.
- **Diagnostics API**: how diagnostics are queried per evaluation node (per [eval.md](./eval.md#diagnostics)).
- **Prelude boundary**: which functions are defined in Glisp source (Prelude) versus bound from the host as primitives. Numeric ops (`+`, `*`, `<`) are likely host-bound; higher-order helpers (`map`, `filter`, `reduce`) are written in Glisp.
- **Top-level structure**: a single evaluable program vs. a module system with imports/exports.
- **Incremental / differential evaluation**: how the host signals AST changes and what the host receives in return.
- **Bidirectional evaluation**: editing a result, inferring corresponding inputs.
