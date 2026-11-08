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

`evaluate(ast, env)` is the same evaluation without a cache that outlives an edit, unless `env` is on top of a frame a `Runtime` has adopted, as a `Session`'s is. It returns `{ value, diagnostics }` and does not throw on errors in the program.

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
session.setAtPath(['p', 'q'], lit(2))  // null, or why the path cannot be reached; a field or an argument is a key, as 'x:'
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

The fifth argument is the type of variadic arguments, and the sixth is what they are called (`rest` if unsaid). `numberType` and the others are bound in the prelude, so read them from there: `evaluate(parse('number'), env).value`.

The types are checked at run time: an argument that does not fit is replaced by the type's default, with a diagnostic. A host function must be pure, because `Runtime` caches its results across edits, and because a program comes to the same on any machine: it reads no clock and no `Math.random`.

A host function that throws yields `()` with a diagnostic.

A parameter is required, and leaving it out is a diagnostic. `withOptional(fn, ['a'])` lets it go unpassed, when it quietly takes its type's default, as `a?:` does in a function literal.

A host function gets values, in which nothing is left of how they were written. `withWritten(fn, (value, args) => ...)` goes over what it returned, given the arguments as written.

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

### How it works backward

`withInverse` says what an argument would have to be for a call to give a result, the others staying as they are. It returns `undefined` if nothing would do. See [`solve`](#working-backward).

```ts
withInverse(add, (index, result, args) => result - args[1 - index])
```

For a function that takes a function, the fourth argument has `invert(fn, result, current)`, which is what to call `fn` with for it to give `result`, or `undefined`.

### What goes with a type

`withMembers` gives a type what can be read from it with `.`, so that it is a set of values and the functions on them under one name.

```ts
makeTopLevel({
	vec2: host(withMembers(makeTupleType([numberType, numberType]), { add, scale })),
})
// (=> [p: vec2]: vec2 (vec2.scale p 2))
```

It changes the type it is given, so make one of your own rather than giving members to `number`. A host value that is a plain record of these reads the same way, as `geom.rect.center`, and static analysis can see through both.

### What it is called as

A type is called as its [constructor](./types.md#constructors), which a tuple or a record makes of what it says it is made of. A type whose values are of a host's own making says nothing of what they are made of, so `withConstructor` gives it the function it is called as:

```ts
withConstructor(rectType, makeRect) // (rect [0 0] [10 10])
```

That function is the type's, and goes on being a function as any other: what it takes is what calling the type takes, and its inverse is how working backward goes through it.

### What a part of it is called

A parameter's type can say what its values are for, with an `icon` of its own, which goes over that of the value in it: `[0 0]` is only a vector, but where a point is wanted it shows as a point.

Metadata on the element types of a tuple is for showing one of its elements: `title` names it, also as the parameter it is to the type's constructor, and `prefix` or `fieldIcon` go in its field. A `fieldIcon` can be letters, as `char:X`.

A `name` on a type is what a host calls it to someone reading it, in place of its `typeName`, which spells out what it is made of. A `summary` is what a host shows in place of a value that is not much to read.

### What it does

A function that comes with a type, as a member, has no binding to write `^{doc}` or `^{label}` on. `withDoc` says what it does, and what to call it, for a host to show.

```ts
withMembers(path, { rect: withDoc(makeRect, 'A rectangle from its `origin`.', 'Rectangle') })
```

A word in backticks stands for a parameter, as it does in a `doc`.

### A value of your own

A host value whose insides are its own, such as an object from WebAssembly, says how it is written with `AS_SOURCE`, for it to go back to being code when it is evaluated in place, shown in a REPL, or saved.

```ts
class Path {
	constructor(readonly d: string) {}
	[AS_SOURCE]() {
		return new CallAST(parse('path.d'), [lit(this.d)])
	}
}
```

What it writes should come to a value the same as itself. It is the last rung of its ladder, and `solve` goes back through it like any other call.

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

`format(source, {width?})` lays source out anew, in lines of up to `width` (80) where they can be broken, and `formatRange(source, from, to, {width?})` does so only for the least of what is written that has all of `from` to `to` in it, as `{from, to, text}`, or null if nothing is there. The source need not be one expression, as a program's bindings are not. Only what is between tokens changes, and comments stay. Both throw `ParseError` or `LexError` if its brackets do not go together, and neither takes an AST, which has no comments.

The builders are functions, also collected as `g`:

| Builder                          | Result                       |
| -------------------------------- | ---------------------------- |
| `lit(42)`                        | `42`                         |
| `host(value)`                    | any JS value, evaluated as itself. Prints as a label such as `<host-fn>`, so it does not round-trip |
| `sym('x')`                       | `x`                          |
| `call(head, a, b)`               | `(head a b)`                 |
| `callKw(head, [a], { k: b })`    | `(head a k: b)`              |
| `access(target, 'x')`            | `target.x`                   |
| `vec(a, b)`                      | `[a b]`                      |
| `record({ x: a })`               | `{x: a}`                     |
| `letBlock([['a', x]], body)`     | `{a = x body}`, also `g.let` |
| `fn({ a: T }, R)`                | `(=> [a: T]: R)`             |
| `.withBody(expr)`                | `(=> [a: T]: R expr)`        |
| `.withGenerics('T')`             | `(=> {T} [a: T]: R)`         |
| `path('..', 'x')`                | `../x`                       |
| `path('/', 'x', 0)`              | `/x/0`                       |
| `path('.', 'a', 'x:')`           | `./a/x:`, a key              |
| `named('c', a)`                  | `c = a`, outside a let-block too. `nameOf(a)` asks |
| `unquote(a)`, `spread(a)`        | `~a`, `...a`                 |
| `meta({ label: 'x' }, a)`        | `^{label: "x"} a`            |
| `pin(a)`, `unpin(a)`             | `@a`, and `a` from it. `isPinned(a)` asks |
| `hide(a)`, `unhide(a)`           | `#_a`, and `a` from it. `isHidden(a)` asks |

`g.number`, `g.string`, `g.boolean`, `g.unit`, `g.top`, `g.bottom`, `g.vector(T)` and `g.oneOf('a', 'b')` (which is `(| "a" "b")`) build **ASTs** of type expressions: they are what you would write in source, not `TypeValue`s.

## Editing

An edit makes a new AST.

```ts
renameBinding(block, 'a', 'b')  // a new let-block, or null if it cannot be
renameBindingIn(root, block, 'a', 'b')  // the same for a let-block inside `root`
mergeBindingIn(root, block, 'a', 'b')   // `a` gone into `b` of the same block, or null
isBindingName('a')              // whether a name can be a binding's
```

`renameBinding` renames a binding of a `LetAST`, and what refers to it follows along: names inside the block, leaving alone what a nearer binding shadows, and paths such as `./a`, which shadowing does not touch. It returns null if the block has no such binding, or if the new name is not a name, is taken in the block, would be caught by something inside, or would catch a name inside that means something else.

Giving an expression a name, or another name, can catch what refers to something farther out: naming the `2` in `{x = 10 y = (+ 2 (* x 3))}` as `x` would have `(* x 3)` mean the `2`. An edit that names must not change what anything refers to: what it would catch becomes a path to what it meant, as `../../x`, the shortest that reaches it (see `shortestPath` below). This is what lets a host name anything at any time, as a canvas names a shape when something comes to refer to it. Only when no path reaches what was meant, as from inside a function literal to a name it closes over, does the edit refuse. Renaming follows the same rule, for what the new name would catch.

`renameBindingIn` also follows paths from elsewhere in `root`, and what is unchanged stays `===`. A path that reaches the block through a call's argument by position is left as written, since following it needs the call's signature, and then reports an error.

`mergeBindingIn` makes two bindings of one block one: what refers to `a`, by name or by path, refers to `b` as a rename would have it, and `a` is gone, so that two names for things alike are one name. It returns null if the block does not have both, or if a nearer `b` would catch a reference to `a`.

Putting a node into a call moves it a level down, and paths count levels, so they have to follow too:

```ts
withPathsInto(root, env, call)  // `call`, in `root`, has just been put where its first argument was
withoutCall(root, env, call)    // `root` with `call` replaced by its first argument
```

Either way, a path comes to what it came to: `a/center:` becomes `a/path:/center:` once `a` is in a call with a first parameter `path`, and what climbs out of the node climbs one level more. A name stays a name wherever what the call comes to is taken too, and otherwise, given as an argument that wants something else, goes to what is held, as `../a/path:`; `withoutCall` has it be a name again. A path to anything else of a call that is taken away has nothing left to lead to, and stays as written. A path from the root stays one, and has no levels to make up for.

A host evaluates what it edits against `session.hostEnv`, not `session.env`, which holds the let-block as it was: there, a path from the root would start at that.

A host making a reference writes the shortest of what reaches it: a name, then a relative path, then a path from the root, the earlier one if they are as short (`shortestPath`). An edit moving a binding to another let-block tells `withPathsMoved(root, env, from, to)`, so that paths from the root go on reaching it. Any edit that moves things around can have every path go on reaching what it reached with `withPathsFollowed(before, after, env)`, where what was reached is the same node in `after`: a path that no longer gets there is written anew, the shortest of a relative path and one from the root.

## Working backward

```ts
solve(root, env, node, value, { held })  // { ast, diagnostics }: `root`, edited so that `node` gives `value`
```

`node` is somewhere in `root`, which stands in `env`. `value` can have `UNSET` in it for a part that can be whatever it comes to. `held` is a set of nodes that stay as they are for this edit, as `@` would have them: what the host has set already in the same gesture. `ast` is null, with a diagnostic saying where it stopped, if there is no way to the value. See [Working backward](./eval.md#working-backward).

## Checking and reflection

These run no value expression, apart from type expressions.

```ts
check(ast, env)             // every diagnostic, including in what never runs
infer(ast, env)             // the TypeValue, or null if it cannot be determined
printType(type)             // a type as source, with what `type.meta` says
resolveTypeSlot(ast, env)   // `ast` read as a type, or null
typeFits(actual, expected)  // whether one type fits another
resolve(ast, env)           // what each name and path refers to
freeRefs(ast)               // what a node needs from outside itself
evaluatedRefs(ast)          // the same, apart from what only metadata refers to
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
