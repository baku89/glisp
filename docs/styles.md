# スタイルの応用

[はじめてのスケッチ](get-started)でも解説したとおり、エレメントはスタイルを適用することに初めて描画されます。スタイルは「色」や「線幅」など様々なプロパティからなりますが、それらはあるルールに基づいて継承、描画され、また参照することができます。

## プロパティの参照

`style` 関数の内側では、適用されているスタイルのプロパティにアクセスすることができます。

```cljs
(style (fill "pink")
 (text *fill-color* [50 50] :size 24))
```

ここでは、外側の `fill` 関数で設定された `"pink"` を、シンボル `*fill-color*` によって参照しています。（「\*」で挟まれた変数名は、グローバル変数のようなシンボルを表しています。）同様に`*stroke-color*` や、 `*stroke-width*`、`*stroke-cap*` で線のプロパティにアクセスすることもできます。これはフローチャートなど、縁取りと同じ色でテキストを塗るときにも便利です。

```cljs
(style (stroke "royalblue")
 (ngon [50 50] 40 4)

 (style [(no-stroke) (fill *stroke-color*)]
  (text "Hello" [50 50])))
```

ここで `no-fill` 関数が登場していますが、これによって、それ以前に適用された塗りを無効にすることができます。以下のようなイメージです。

```clojure
(stroke "royalblue") -> (no-stroke) -> (fill *stroke-color*)
^^^^^^^^^^^^^^^^^^^^                   ^^^^^^^^^^^^^^^^^^^^^
no-fill によって打ち消される      打ち消されてもなお *stroke-color* は "royalblue" に設定されている
```

こうすることで、Hello というテキストに線が適用され、太くなってしまうのを防ぎます。これは矢印を描くときにも使えます。

```cljs
(style (stroke "pink" 2)
 (line [10 50] [80 50])

 (style [(no-stroke) (fill *stroke-color*)]
  (ngon [80 50] 10 3)))
```

## スタイルの実体

`fill` 関数も `stroke` 関数も、実際には CSS のようなプロパティからなる連想配列を返します。

```clojure
(fill "pink") -> {:fill true :fill-color "pink"}

(stroke "skyblue" 10) -> {:stroke true :stroke-color "skyblue" :stroke-width 10}
```

ですから、もちろん`style` 関数に直接これらのマップを渡すことも可能です。

CSS と違うのは、「スタイルを有効にするかどうか」と、そのスタイルへの色指定が別のプロパティになっている点です。例えば CSS で`fill: "pink";`を設定することで塗りを有効にすると同時に塗りの色も指定していますが、Glisp ではそれぞれ `:fill` 、 `:fill-color` という独立したプロパティとなっています。この仕組みによって、`style` 関数の内側のパス全てに描画を与えることなく、スタイルの色のデフォルト値を指定することが出来ます。

```cljs
(style {:fill-color "royalblue"}

 (style (fill)
  (text "Hello" [50 50]))

 (style (stroke "pink")
  (circle [50 50] 40)))
```

色に限らず、プロパティはそれ自身が描画されずとも内側のエレメントへと継承されていきます。同じプロパティが設定された場合は、CSS 同様に内側のプロパティが優先されます。

```cljs
(style {:stroke-dash [15 4]}
 (style (stroke "crimson" 2)
  (circle [50 50] 40))

 (style (stroke "plum" 2 :dash [4 4])
  (ngon [50 50] 40 5)))
```

## スタイルのプリセット化

スタイルは単なるマップなので、変数として定義することでプリセットのように随所で使い回すことができます。もちろん、他のスタイルと組み合わせて適用することも可能です。

```cljs
(def fill-skyblue (fill "skyblue"))

(style fill-skyblue
 (rect [10 10] [40 40]))

(style [fill-skyblue (stroke "crimson" 5)]
 (circle [70 70] 20))

```
