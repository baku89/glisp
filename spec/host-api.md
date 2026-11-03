# Glisp Host API

The host is the application embedding Glisp. Everything here is exported by `@glisp/lang`.

## Evaluating a program

A host keeps an immutable AST and hands each new version to a `Runtime`.

```ts
import { buildPrelude, parse, Runtime } from '@glisp/lang'

const runtime = new Runtime(buildPrelude())
runtime.setRoot(parse('{a = 10 b = (+ a 1) [a b]}'))

runtime.evaluate()        // { value: [10, 11], diagnostics: [] }
runtime.read('b')         // { value: 11, diagnostics: [] }
runtime.setRoot(nextAst)  // what did not change is reused, and stays `===`
```

- `evaluate(ast?, env?)` evaluates the root, or `ast` in `env`.
- `read(...path)` evaluates a sub-expression of the root, in its scope, by the names and indices leading to it.
- `stats()` and `resetStats()` report what was computed and what came from the cache.
- Options: `maxEntries`, the cached results to keep, and `heavyMs`, how long a result inside a function call has to take to be kept.

See [Incremental evaluation](./eval.md#incremental-evaluation) for what `Runtime` guarantees and asks of host functions.

`evaluate(ast, env)` is the same evaluation without a cache that outlives an edit. It returns `{ value, diagnostics }` and does not throw on errors in the program.

The AST does not need to be a descendant of anything in `env`. The env is only the scope for names and paths, so a host can evaluate a sub-expression, or a synthesized AST, against any env.

## Values

A value is the corresponding plain JS value, with no wrapper.

| Glisp value   | JS value                                                 |
| ------------- | -------------------------------------------------------- |
| `number`      | `number`                                                 |
| `string`      | `string`                                                 |
| `boolean`     | `boolean`                                                |
| `unit` (`()`) | `UNIT`, which is `Symbol.for('glisp.unit')`              |
| vector        | `Array`                                                  |
| record        | plain `object`                                           |
| closure       | a callable `function`, which is also `isGlispClosure`    |
| host function | a callable `function`, which is also `isTypedHostFn`     |
| type          | a `TypeValue` object, which is `isTypeValue`. Not callable |
| action        | an `IO`, with a `run()`                                  |

Values may be shared between positions, so they must not be mutated. A closure called from JS evaluates in its captured env and returns a JS value.

`unit` is a registered Symbol so that it cannot be confused with `null`, `undefined`, or a missing key.

## Environments

An `Env` is a chain of frames ([Environment](./eval.md#environment)).

```ts
buildPrelude()                     // the standard env, a new one each call
emptyEnv                           // no bindings
makeTopLevel({ width: lit(100) })  // a root frame binding names to ASTs
```

Bindings are ASTs, evaluated lazily. A frame is not modified after it is made. To extend an env, make a frame whose `parent` is it, or put bindings in a let-block.

```ts
const env: Env = {
	ast: new LetAST([], null),
	parent: buildPrelude(),
	bindings: new Map([['width', { ast: lit(100), env: null }]]),
}
```

`Session` keeps an env as a let-block and edits it. It is what a REPL or an application shell is built on.

```ts
const session = new Session(buildPrelude())
session.exec('x = 1')             // evaluates and runs the action
session.exec('./p/q = 2')         // sets inside a binding, adding a new name
session.exec('(+ x 1)')           // { value: 2, diagnostics: [] }
session.evalSrc('x = 1')          // { value: <IO>, ... }, not yet run
session.ast()                     // the let-block, which is the whole state
session.setAst(earlier)           // restores an earlier let-block, for undo
session.setBinding('y', lit(2))
session.setAtPath(['p', 'q'], lit(2))  // null, or why the path cannot be reached
session.unsetBinding('y')
session.renameBinding('x', 'w')    // null, or why it cannot be
session.env                       // the env to pass to `check`, `infer`, etc.
```

## Host functions

```ts
const add = makeTypedFn(
	[numberType, numberType],   // parameter types
	numberType,                 // return type
	(a, b) => (a as number) + (b as number),
	['a', 'b'],                 // parameter names, for keywords and paths
)

makeTopLevel({ add: host(add) })
```

The fifth argument is the type of variadic arguments. `numberType` and the others are bound in the prelude, so read them from there: `evaluate(parse('number'), env).value`.

The types are checked at run time: an argument that does not fit is replaced by the type's default, with a diagnostic. A host function must be pure, because `Runtime` caches its results across edits.

A host function that throws yields `()` with a diagnostic.

### A more precise type

The parameter types are what values are checked against at run time. `withSignature` adds what only static checking can use, such as generics:

```ts
const T = makeTypeVar('T')
withSignature(
	makeTypedFn([vectorType], topType, xs => xs[0], ['xs']),
	makeFunctionType([makeTupleType([], T)], T, {
		paramNames: ['xs'],
		generics: ['T'],
	})
)
```

The options are `paramNames`, `generics`, `variadicTail`, and `variadicName`, which is what a path calls the variadic arguments (`rest` if unsaid).

### How it expands

A host function has no body, so by default a call to it has no next rung on the [abstraction ladder](./eval.md#multi-step-evaluation--abstraction-ladder): `expand` returns the same node, and the value comes from `evaluate`. `withExpansion` gives it a next rung:

```ts
withExpansion(power, ([base, exp], context) => {
	const n = context.value(exp)           // only what is asked for is computed
	if (!Number.isInteger(n)) return null  // null: no next rung
	return context.call('*', multiply, new Array(n).fill(base))
})
```

- `args` are the argument expressions as written, in parameter order, with variadic arguments at the end. One not passed is `undefined`.
- `context.value(ast)` works out an argument.
- `context.call(name, fn, args)` is a call to `fn`, written as `name` if that is what the name means at the call site, and with `fn` itself embedded if the caller has shadowed it.

### Overloads

`new OverloadValue([fn1, fn2])`, bound with `host`, dispatches to the first variant whose parameters fit the arguments. In Glisp, `(overload f g)`. Order the variants from most to least specific.

### Actions

A host function can return an `IO`. Evaluating it changes nothing, and the host decides when to `run()` it.

```ts
new IO('description', () => {
	// the effect, returning any diagnostics
	return []
})
```

## Building ASTs

`parse(source)` throws `ParseError` or `LexError` on bad syntax. `print(ast)` gives the source back, with its whitespace and comments if it came from `parse`, and with default formatting otherwise.

The builders are functions, also collected as `g`:

| Builder                          | Result                       |
| -------------------------------- | ---------------------------- |
| `lit(42)`                        | `42`                         |
| `host(value)`                    | any JS value, evaluated as itself. Prints as a label such as `<host-fn>`, so it does not round-trip |
| `sym('x')`                       | `x`                          |
| `call(head, a, b)`               | `(head a b)`                 |
| `callKw(head, [a], { k: b })`    | `(head a k=b)`               |
| `access(target, 'x')`            | `target.x`                   |
| `vec(a, b)`                      | `[a b]`                      |
| `record({ x: a })`               | `{x: a}`                     |
| `letBlock([['a', x]], body)`     | `{a = x body}`, also `g.let` |
| `fn({ a: T }, R)`                | `(=> (a: T): R)`             |
| `.withBody(expr)`                | `(=> (a: T): R expr)`        |
| `.withGenerics('T')`             | `(=> (T) (a: T): R)`         |
| `path('..', 'x')`                | `../x`                       |
| `unquote(a)`, `spread(a)`        | `~a`, `...a`                 |
| `meta({ label: 'x' }, a)`        | `^{label: "x"} a`            |

`g.number`, `g.string`, `g.boolean`, `g.unit`, `g.top`, `g.bottom`, `g.vector(T)` and `g.enum('a', 'b')` build **ASTs** of type expressions: they are what you would write in source, not `TypeValue`s.

## Editing

An edit makes a new AST.

```ts
renameBinding(block, 'a', 'b')  // a new let-block, or null if it cannot be
isBindingName('a')              // whether a name can be a binding's
```

`renameBinding` renames a binding of a `LetAST`, and what refers to it inside the block follows along: names, leaving alone what a nearer binding shadows, and paths such as `./a`, which shadowing does not touch. It returns null if the block has no such binding, or if the new name is not a name, is taken in the block, or would be caught by something inside. It sees only the block, so a path from outside that leads into it is left as written, and then reports an error.

## Checking and reflection

These run no value expression, apart from type expressions.

```ts
check(ast, env)             // every diagnostic, including in what never runs
infer(ast, env)             // the TypeValue, or null if it cannot be determined
resolveTypeSlot(ast, env)   // `ast` read as a type, or null
typeFits(actual, expected)  // whether one type fits another
resolve(ast, env)           // what each name and path refers to
freeRefs(ast)               // what a node needs from outside itself
callParameters(call, env)   // what the head calls its parameters
expectedTypeAt(parent, slot, env)  // the type a position wants
```

`expectedTypeAt` is for editors asking what fits in a position. `slot` is an argument's index or name in a call, or `'return'` or `'param:N'` in a function literal. It returns null when nothing constrains the position. For a call, it currently evaluates the head.

## The abstraction ladder

```ts
expand(ast, env)        // one step: the same node if there is no next rung
expandLadder(ast, env)  // every rung, starting with `ast`
expandAll(ast, env)     // the last rung
```

Which sub-expression to step is up to the host. See [Multi-step evaluation](./eval.md#multi-step-evaluation--abstraction-ladder).

`toAst(value, env)` turns a value back into an AST whose evaluation yields it: a bound name if `env` has one for that value, and a `host` node for what has no source form.

## Diagnostics

```ts
interface Diagnostic {
	level: 'error' | 'warning' | 'info'
	message: string
	source: { ast: AST; env: Env }
}
```

`source.ast.source`, when present, is `{ text, start, end }`: the range in the source it was parsed from. A result cached by `Runtime` keeps the diagnostic from when it was computed, so this may belong to an earlier root.
