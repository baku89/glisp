# Applying Styles

As explained in the [First Sketch](get-started-en), an element is rendered only when a style is applied. A style consists of several properties such as color and thickness, and they can be inherited, drawn and referenced based on some rules.

## Referring to a property

Inside `style` function, applied style properties can be accessed.

```cljs
(style (fill "pink")
 (text *fill-color* [50 50] :size 24))
```

Here, the symbol `*fill-color*` refers to the string `"pink"` set by `fill` function in the outer scope (variable names surrounded by `*` denote a symbol similar to global variables). Similarly, line properties can accessed by `*stroke-color*`, `*stroke-width*` and `*stroke-cap*`. This is useful, for example, for a flowchart whose outline and text colors are filled with the same color.

```cljs
(style (stroke "royalblue")
 (ngon [50 50] 40 4)

 (style [(no-stroke) (fill *stroke-color*)]
  (text "Hello" [50 50])))
```

Here, `no-stroke` function is used, which cancels the previous stroke styles. The following is an explanation.

```clojure
(stroke "royalblue") -> (no-stroke) -> (fill *stroke-color*)
^^^^^^^^^^^^^^^^^^^^                   ^^^^^^^^^^^^^^^^^^^^^
no-stroke is cancelled      even though stroke is cancelled, *stroke-color* remains as "royalblue"
```

This method prevents the text Hello to become thicker with the outline applied. This is useful for drawing an arrow.

```cljs
(style (stroke "pink" 2)
 (line [10 50] [80 50])

 (style [(no-stroke) (fill *stroke-color*)]
  (ngon [80 50] 10 3)))
```

## The content of a style

`fill` and `stroke` function actually returns a map similar to CSS properties.

```clojure
(fill "pink") -> {:fill true :fill-color "pink"}

(stroke "skyblue" 10) -> {:stroke true :stroke-color "skyblue" :stroke-width 10}
```

Therefore, such a map can be directly passed to `style` function.

Unlike CSS, a property whether the style is enabled and a style property for the color selection are separated. For example, `fill: "pink";` in CSS enables fill and sets the fill color, but Glisp holds two independent properties `:fill` and `:fill-color`, respectively. Thus, a default style color can be set without affecting the rendering of all the paths inside `style` function.

```cljs
(style {:fill-color "royalblue"}

 (style (fill)
  (text "Hello" [50 50]))

 (style (stroke "pink")
  (circle [50 50] 40)))
```

Not only colors, properties are inherited to the inner elements even if it is not rendered. When a property is overwritten, the innermost property is chosen as CSS does.

```cljs
(style {:stroke-dash [15 4]}
 (style (stroke "crimson" 2)
  (circle [50 50] 40))

 (style (stroke "plum" 2 :dash [4 4])
  (ngon [50 50] 40 5)))
```

## Presetting a style

Since a style is merely a map, it can be reused as a preset by declaring as a variable. Of course, it can be applied in conjunction with other style.

```cljs
(def fill-skyblue (fill "skyblue"))

(style fill-skyblue
 (rect [10 10 40 40]))

(style [fill-skyblue (stroke "crimson" 5)]
 (circle [70 70] 20))

```
