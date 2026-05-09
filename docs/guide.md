# Getting Started

This guide walks through Glisp's core forms with examples you can try in the [browser playground](./playground.md) or in a terminal REPL.

## Setup

```sh
git clone https://github.com/baku89/glisp
cd glisp
git checkout lang-2026
npm install
npm run repl
```

The REPL prints prompts as `glisp>`. Top-level expressions evaluate immediately; `IO`-typed values (those returned by `def` and `undef`) are forced automatically.

## Atoms

```glisp
42                  ;; number
3.14                ;; number
"hello"             ;; string
true  false         ;; boolean
()                  ;; unit
_                   ;; top  (accepts anything)
!                   ;; bottom (accepts nothing)
```

## Calls

A call is `(head arg ... kwarg=...)`. Whitespace separates tokens; commas are not used.

```glisp
(+ 1 2 3)              ;; → 6
(* 2 (+ 3 4))          ;; → 14
(f 1 step=2)           ;; positional + keyword
```

## Vectors and records

```glisp
[1 2 3]                ;; vector
{x: 10 y: 20}          ;; record
([1 2 3] 1)            ;; → 2  (vector access by index)
({x: 10 y: 20} "x")    ;; → 10 (record access by key)
{x: 10 y: 20}.x        ;; → 10 (sugar for the same)
```

## Functions

Function literals take an explicit signature and an inferred body. The arrow is `=>`.

```glisp
(=> (x: number y: number): number
  (+ x y))

;; Single-arg form
(=> (n: number): number (* n n))

;; Bind it
(def "square" (=> (n: number): number (* n n)))
(square 7)             ;; → 49
```

A function is itself a value. Higher-order use is the same as anywhere:

```glisp
(map [1 2 3 4] (=> (n: number): number (* n n)))
;; → [1 4 9 16]

(reduce [1 2 3 4 5] 0 (=> (a: number b: number): number (+ a b)))
;; → 15
```

## Types

Types are first-class values. The prelude binds `number`, `string`, `boolean`, `unit`, `_`, `!`, `IO`. You can build new ones:

```glisp
;; Enumeration of literal members
(def "Color" (enum "red" "green" "blue"))

;; Refinement: a base type narrowed by a predicate, with a default
(def "Pos"
  (refine number 1 (=> (n: number): boolean (> n 0))))

;; Parametric IO: an IO that produces a number when forced
(IO number)            ;; → (IO number)  (a type value)
```

### Coercion: `@`

`(@ T v)` coerces `v` through type `T`. If `v` fits, it's passed through; otherwise the type's `default` takes its place and a diagnostic is recorded.

```glisp
(@ number 42)          ;; → 42
(@ number "oops")      ;; → 0   (default; diagnostic emitted)
(@ Color "red")        ;; → "red"
(@ Color "purple")     ;; → "red"  (default = first member)
(@ Pos 5)              ;; → 5
(@ Pos -3)             ;; → 1   (default; predicate failed)
```

The `@` form replaces the older "types are callable" cast. A bare `(T v)` is rejected with a hint pointing to `@`.

## Pattern match: `?`

`(? value clause ...)` runs through clauses in order: a type pattern matches if the value fits, an underscore is the catch-all.

```glisp
(? value
  number  "n"
  string  "s"
  _       "?")
```

Like everything else, `?` does not throw. If no clause matches and there's no default, the result is `()`.

## Pipe: `|>`

`(|> input step ...)` evaluates each step to a function and applies it to the threaded value. Steps must be function-valued, so partial calls use the `%` placeholder (desugared to a one-arg closure):

```glisp
(|> 5
  (* 2 %)          ;; 10
  (+ 1 %)          ;; 11
  (=> (n: number): number (* n n)))   ;; 121
```

`(* 2 %)` desugars to `(=> (_0: _): _ (* 2 _0))`, which is what gets applied to the threaded value at each step.

## Let-blocks

Curly braces with `name = expr` pairs introduce local bindings; the trailing form is the value of the block.

```glisp
{
  a = 10
  b = 20
  c = (* a b)
  (+ a b c)
}
;; → 230
```

Bindings are self-referential and can reference each other in any order, which is useful for recursive definitions.

## Quasiquote and macros

Back-tick `` ` `` quotes; `~` unquotes; `...~` splices a vector into a list-building parent. Macros are functions whose body is a quoted template:

```glisp
(def "twice"
  (=> (x: number): _ `(* 2 ~x)))

(twice 5)              ;; expand step: `(* 2 5), evaluates to 10
```

The `expand` operation is one transparent step on the abstraction ladder. See the [evaluation spec](./spec/eval.md) for how `expand` and `eval` relate.

## Diagnostics

Glisp never throws on user errors. Type mismatches, unresolved names, and arity failures produce `(message, source)` diagnostics that the host surfaces alongside the result.

```glisp
(+ "a" 2 "b")
;; → 2  (the one numeric arg)
;; diagnostics: type mismatch: expected number, got string  (×2)
```

This is what makes editing in a GUI viable. The editor always has a value to display, even mid-edit, and diagnostics layer on top rather than blocking computation.

## Where next

- [Playground](./playground.md): try it live in the browser.
- [Specification](./spec/README.md): the full design rationale and grammar.
- [Source](https://github.com/baku89/glisp): the `lang-2026` branch is the active rewrite.
