# Getting Started

This guide walks through Glisp's core forms with examples you can try in the [browser playground](./playground.md) or in a terminal REPL.

## Setup

```sh
git clone https://github.com/baku89/glisp
cd glisp
npm install
npm run repl
```

The REPL shows two columns: input and results on the left, and on the right the environment, always visible as the let-block it is, with each value in a comment. Top-level expressions evaluate immediately; `name = expr` sets a binding in the session. It is shell syntax for an `IO` action, and the REPL runs top-level `IO` values automatically.

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

A call is `(head arg ... kwarg: ...)`. Whitespace separates tokens; commas are not used.

<!-- test -->
```glisp
(+ 1 2 3)              ;; → 6
(* 2 (+ 3 4))          ;; → 14
```

Arguments can also be passed by name, as in `(f 1 step: 2)`.

## Vectors and records

```glisp
[1 2 3]                ;; vector
{x: 10 y: 20}          ;; record
([1 2 3] 1)            ;; → 2  (vector access by index)
({x: 10 y: 20} "x")    ;; → 10 (record access by key)
{x: 10 y: 20}.x        ;; → 10 (sugar for the same)
```

## Functions

Function literals take an explicit signature and an inferred body. The arrow is `=>`, the parameters go in brackets, and the return type follows them after `:`. A generic function names its type parameters in braces first, as in `(=> {T} [x: T]: T x)`.

<!-- test -->
```glisp
(=> [x: number y: number]: number
  (+ x y))

;; Single-arg form
(=> [n: number]: number (* n n))

;; Bind it
square = (=> [n: number]: number (* n n))
(square 7)             ;; → 49
```

A function is itself a value. Higher-order use is the same as anywhere:

<!-- test -->
```glisp
(map [1 2 3 4] (=> [n: number]: number (* n n)))
;; → [1 4 9 16]

(reduce [1 2 3 4 5] 0 (=> [a: number b: number]: number (+ a b)))
;; → 15
```

### Randomness

A program comes to the same every time, on any machine, so there is nothing random to call. `random.number` takes a seed and makes a sequence instead: a function from a number to the value at that place in it. Asking for more leaves what came before as it was.

<!-- test -->
```glisp
((random.number 42) 0)                        ;; → 0.2608322922664409
(map (range 0 2) (random.number 42))          ;; → [0.2608322922664409 0.18141092023533278]
((random.pick 42 ["a" "b" "c"]) 0)            ;; → "a"
```

`random.between` makes one from `lo` up to `hi`. A vector as a seed gives another sequence for another purpose, as `(random.number [seed "radius"])`.

## Types

Types are first-class values. The prelude binds `number`, `string`, `boolean`, `unit`, `_`, `!`, `IO`. You can build new ones:

<!-- test -->
```glisp
;; Enumeration of literal members
Color = (| "red" "green" "blue")

;; A type narrowed by a predicate, with a default
Pos = (: number #(> % 0) default: 1)

;; Union: the values of any of the types, defaulting to the first one's
Size = (| number [number number])

;; Parametric IO: an IO that produces a number when forced
(IO number)            ;; → (IO number)  (a type value)
```

### Coercion: `^T v`

`^T v` coerces `v` through type `T`. If `v` fits, it's passed through; otherwise the type's `default` takes its place and a diagnostic is recorded.

<!-- test -->
```glisp
^number 42          ;; → 42
^number "oops"      ;; → 0   (default; diagnostic emitted)
Color = (| "red" "green" "blue")
Pos = (: number #(> % 0) default: 1)

^Color "red"        ;; → "red"
^Color "purple"     ;; → "red"  (default = first member)
^Pos 5              ;; → 5
^Pos -3             ;; → 1   (default; predicate failed)
Size = (| number [number number])

^Size [10 20]       ;; → [10 20]
^Size "big"         ;; → 0   (default = the first member's)
```

`^T v` says what `v` is to be. Calling a type makes a value of it: `(Point x: 1)` is `{x: 1 y: 0}` for `Point = {x: number y: number}`, and `(number "a")` is `0`, as `^number "a"` is.

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
  (=> [n: number]: number (* n n)))   ;; 121
```

`#(* 2 %)` desugars to `(=> [_0: _]: _ (* 2 _0))`, which is what gets applied to the threaded value at each step.

## Let-blocks

Curly braces with `name = expr` pairs introduce local bindings; the trailing form is the value of the block.

<!-- test -->
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

## Abstraction steps

A function's body is its next step on the abstraction ladder, so you can define what a function *is* one level down. `~` marks an implementation detail: it is worked out within the step, so recursion and helpers stay out of view. Only what is needed gets computed, and an argument that is merely passed along stays as written. `...~` inlines the resulting vector.

```glisp
repeat = (=> {T} [v: T n: number]: [...T]
             (? (== n 0) true [] _ [v ...(repeat v (- n 1))]))
pow = (=> [x: number a: number]: number (* ...~(repeat x a)))

(pow (+ 1 1) (+ 1 2))  ;; expands to (* (+ 1 1) (+ 1 1) (+ 1 1)), evaluates to 8
```

The `expand` operation is one step on the abstraction ladder. `~` never changes the final value. See the [evaluation spec](./spec/eval.md) for how `expand` and `eval` relate.

## Diagnostics

Glisp never throws on user errors. Type mismatches, unresolved names, and arity failures produce `(message, source)` diagnostics that the host surfaces alongside the result.

<!-- test -->
```glisp
(+ "a" 2 "b")
;; → 2  (the one numeric arg)
;; diagnostics: type mismatch: expected number, got string  (×2)
```

This is what makes editing in a GUI viable. The editor always has a value to display, even mid-edit, and diagnostics layer on top rather than blocking computation.

## Where next

- [Playground](./playground.md): try it live in the browser.
- [Specification](./spec/README.md): the full design rationale and grammar.
- [Source](https://github.com/baku89/glisp).
