# Draw Tree

When evaluated, a Glisp sketch returns what we call a "draw tree". For example,

```cljs
(style (fill "darkblue")
 (rect [10 10 80 80]))
```

is evaluated as follows.

```clojure
[:g :_
 [:style {:fill true :fill-color "darkblue"}
  [:path :M [10 10] :L [90 10] :L [90 90] :L [10 90] :Z]]]
```

Unlike a sketch, a draw tree is a static data that does not include function calls and only describes the final graphic output. It is similar to a structure of SVG format. To render on the viewport or to output to various formats, such as PNG and SVG, the the draw tree is passed to the renderer under the hood.

Most of the graphics-related functions such as `rect` and `style` return a draw tree. Of course, a draw tree can be directly written on the sketch; however, the context of the editing information (for example, a circle is at a certain point with a certain diameter) is omitted. The relationship between an edit file and an outlined file in Illustrator is an analogy of a Glisp sketch and a draw tree (although this is an issue with the implementation, the viewport may not function properly when the draw tree is handwritten).

## Advantages

Since a draw tree in Glisp does not contain dynamic data and the structure is simple, the render does not need an evaluator and thus can be simplified ([implementation in Canvas API](https://github.com/baku89/glisp/blob/master/src/renderer/render-to-context.ts)). Also, the project file can contain its evaluated draw tree in addition to the sketch. With this idea, the project file can be used an outlined data for printing, or a viewer app can be easily made for previewing the file.

## Revealing the draw tree

The draw tree of the current sketch can be revealed by typing `*view*` in the console. Or, pressing `Ctrl+E` in the editor unfolds parentheses highlighted yellow by the cursor into an evaluated values. By pressing the command a few times, functions will be gradually replaced by draw trees.

## Syntax

A draw tree consists of a vector whose elements are categorized to ones with and without child elements.

- **with child elements**: `:g` `:clip` `:transform` `:style`
- **empty elements (without children)**: `:path` `:text` etc.

All elements with children have the following structure.

```
[:<tag><#ID (optional)> <attribute> <child1> <child2> ...]
```

`:path` has the same structure as an SVG [path command](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d#Path_commands). Nevertheless, the only available commands are `M` `L` `C` `Z`, which set the absolute position. This is also to keep the renderer implementation simple.

```clojure
[:path :M [0 0]                    ;; moveTo
       :L [100 100]                ;; lineTo
       :C [50 100] [50 50] [20 20] ;; cubicCurveTo
       :Z]
```
