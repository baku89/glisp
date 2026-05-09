# はじめに

Glisp のコアフォームを、[ブラウザの Playground](./playground.md) かターミナル REPL で試しながら一通り見ていきます。

## セットアップ

```sh
git clone https://github.com/baku89/glisp
cd glisp
git checkout lang-2026
npm install
npm run repl
```

REPL のプロンプトは `glisp>`。トップレベルの式はそのまま評価されます。`def` や `undef` が返す `IO` 値は自動で実行されます。

## アトム

```glisp
42                  ;; 数値
3.14                ;; 数値
"hello"             ;; 文字列
true  false         ;; 真偽値
()                  ;; unit
_                   ;; top  (どんな値も受け入れる)
!                   ;; bottom (一つも受け入れない)
```

## 呼び出し（call）

呼び出しは `(head arg ... kwarg=...)` の形。トークンは空白で区切ります。カンマは使いません。

```glisp
(+ 1 2 3)              ;; → 6
(* 2 (+ 3 4))          ;; → 14
(f 1 step=2)           ;; 位置引数 + キーワード引数
```

## ベクタとレコード

```glisp
[1 2 3]                ;; ベクタ
{x: 10 y: 20}          ;; レコード
([1 2 3] 1)            ;; → 2  (インデックスアクセス)
({x: 10 y: 20} "x")    ;; → 10 (キーアクセス)
{x: 10 y: 20}.x        ;; → 10 (アクセサ糖衣)
```

## 関数

関数リテラルは「シグネチャは明示・本体は推論」のスタイル。アロー記号は `=>`。

```glisp
(=> (x: number y: number): number
  (+ x y))

;; 単引数の場合
(=> (n: number): number (* n n))

;; 名前付きで bind
(def "square" (=> (n: number): number (* n n)))
(square 7)             ;; → 49
```

関数自体が値なので、高階関数の使い方は他の言語と同じです：

```glisp
(map [1 2 3 4] (=> (n: number): number (* n n)))
;; → [1 4 9 16]

(reduce [1 2 3 4 5] 0 (=> (a: number b: number): number (+ a b)))
;; → 15
```

## 型

型はファーストクラスな値です。Prelude には `number`, `string`, `boolean`, `unit`, `_`, `!`, `IO` が bind されていて、新しい型を組み立てることもできます：

```glisp
;; リテラル値の集合（enum）
(def "Color" (enum "red" "green" "blue"))

;; 述語で絞った refinement。default を明示的に渡す
(def "Pos"
  (refine number 1 (=> (n: number): boolean (> n 0))))

;; parametric IO: 実行すると number を返す IO
(IO number)            ;; → (IO number)  （型の値）
```

### 型変換: `@`

`(@ T v)` は `v` を型 `T` に変換します。`v` が型に合えばそのまま、合わなければ型の `default` に置き換わって診断が記録されます。

```glisp
(@ number 42)          ;; → 42
(@ number "oops")      ;; → 0   (default。診断あり)
(@ Color "red")        ;; → "red"
(@ Color "purple")     ;; → "red"  (default は最初のメンバ)
(@ Pos 5)              ;; → 5
(@ Pos -3)             ;; → 1   (述語が false なので default)
```

`@` は古い「型を関数として呼ぶ」キャストの代わりです。素の `(T v)` は「`@` を使ってください」というヒント付きで reject されます。

## パターンマッチ: `?`

`(? value clause ...)` は条件節を順番に試します。型がパターンとして使われたときは値がフィットするかをチェック、`_` は catch-all です。

```glisp
(? value
  number  "n"
  string  "s"
  _       "?")
```

`?` も例外は投げません。どの節にもマッチせず default 節もない場合の結果は `()` です。

## パイプ: `|>`

`(|> input step ...)` は各ステップを **値として評価** してから、得られた関数を threaded value に適用します。ステップは関数値である必要があるので、部分適用したい場合は `%` プレースホルダを使います（1 引数クロージャに desugar されます）：

```glisp
(|> 5
  (* 2 %)          ;; 10
  (+ 1 %)          ;; 11
  (=> (n: number): number (* n n)))   ;; 121
```

`(* 2 %)` は `(=> (_0: _): _ (* 2 _0))` に desugar され、threaded value がその唯一のパラメータに渡ります。

## let-block

中括弧 `{name = expr}` でローカル束縛を導入し、最後の式がブロックの値になります。

```glisp
{
  a = 10
  b = 20
  c = (* a b)
  (+ a b c)
}
;; → 230
```

束縛は自己参照可能で、互いを順序によらず参照できます。再帰的な型・関数定義に便利です。

## quasiquote とマクロ

バッククォート `` ` `` は quote、`~` は unquote、`...~` はベクタを親（vec/call/record）に splice します。マクロは本体が quote されたテンプレートになっている関数です：

```glisp
(def "twice"
  (=> (x: number): _ `(* 2 ~x)))

(twice 5)              ;; expand 後: `(* 2 5)、評価で 10
```

`expand` は抽象化のはしごの 1 段降りる操作。`expand` と `eval` の関係は [評価仕様](../spec/eval.md) を参照。

## 診断

Glisp はユーザエラーで例外を投げません。型不一致・名前未解決・arity 不一致は `(message, source)` 形式の診断としてホストに渡されます。

```glisp
(+ "a" 2 "b")
;; → 2  (数値である引数だけが効く)
;; 診断: type mismatch: expected number, got string  (×2)
```

これが GUI で編集可能であるための鍵です。編集途中でも常に表示できる値があり、診断は別レーンに重なる形で乗ります。

## 次に読むもの

- [Playground](./playground.md) ブラウザでそのまま試す
- [仕様書](../spec/README.md) 設計の全体像と文法定義
- [ソース](https://github.com/baku89/glisp) `lang-2026` ブランチが現行の再設計版
