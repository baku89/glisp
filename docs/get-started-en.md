# First Sketch

## Draw a circle

Here is the simplest sketch:

```cljs
(circle [50 50] 40)
```

Function `circle` generates a circle path. `[100 100]` is the center of the circle and `40` for the radius. The origin of Glisp canvas is at the center with the positive direction to the right horizontally and down vertically.

However, since there is no fill or stroke setting, the path is shown as a dashed line. Let' fill this with a tomato color.

```cljs
(style (fill "tomato")
 (circle [50 50] 40))
```

Function `style` applies a style. This function applies the first argument, style `(fill "red")`, to the other arguments, `(circle [50 50] 40)` in this case. Also `fill` is a function that returns style information.

To add stroke color, next `style`'s.

```cljs
(style (fill "RoyalBlue")
 (style (stroke "tomato" 10)
  (circle [50 50] 40)))
```

Styles are rendered from the outermost ones. In this example, first, the circle is filled with a tomato color and the border is drawn in a blue line with a thickness of 10 pixels. This can be concisely expressed by using a vector as the second argument of `style`.

```cljs
(style [(fill "tomato") (stroke "RoyalBlue" 10)]
 (circle [50 50] 40))
```

Style can be applied to a bundle of paths.

```cljs
(style (stroke "turquoise" 6)
 (circle [50 50] 40)
 (rect [20 40 60 20]))
```

Function `rect` returns a path from the top left corner, width and height.

## Transform

Function `transform` sets the transformation parameters of a group's position and angle.

```cljs
(transform (translate [30 30])
 (style (fill "gold")
  (rect [0 0 60 40])))
```

Function `translate` returns a transformation value of parallel translation (which actually is a matrix). Other functions return a transformation value include `scale` and `rotate`, and they can be chained by function `mat2d/*`.

```cljs
(transform (mat2d/* (translate [20 10])
                    (rotate (deg 20))
                    (scale [1.5 1]))
 (style (fill "gold")
  (rect [0 0 50 40])))
```

As `rotate` takes an argument of radians, here function `deg` converts the unit from degree to radian.

You can find detailed explanation in [transformation](transform-en).

## Inspector and handles

In the above examples, you can open the editor by pressing **Open in Editor**. In Glisp, in addition to edit the code as a text, parameters can be adjusted and edited in the viewer and in the inspector at the bottom left of the window. With functions supporting these features, the inspector and handles automatically show up when the inside of the parentheses of the function is selected by the cursor.

![a gif animation of handle demonstration](handles.gif)
