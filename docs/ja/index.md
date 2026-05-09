---
home: true
heroImage: /logo.svg
heroHeight: 140
heroText: Glisp
tagline: S 式・構造的型付け・遅延評価の小さな関数型言語
actions:
  - text: はじめる →
    link: /ja/guide
    type: primary
  - text: ブラウザで試す
    link: /ja/playground

features:
  - title: S 式コア
    details: ソースをそのままラウンドトリップする最小限のパーサと CST。コードはデータ、データはコード、GUI 編集も構造的に行えます。
  - title: 強い構造的型付け
    details: 型は値そのもの。関数型・enum・refinement、そして `(IO T)` のような parametric type までが同じ語彙で組み合わさります。
  - title: 遅延評価＋診断
    details: 評価は決して例外を投げません。すべてのノードに `(message, source)` 形式の診断が積もり、型スロットは黙って default に落ちる — ホストには常に表示できる値があります。
---

<div class="badges" style="margin: 1.2em 0">
	<a href="https://github.com/baku89/glisp">
		<img src="https://img.shields.io/badge/source-github-blue?style=flat-square" alt="GitHub">
	</a>
	&nbsp;
	<a href="https://opensource.org/licenses/MIT">
		<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT">
	</a>
</div>

Glisp は S 式を中核に据えた純粋関数型言語です。強い静的型付け・型推論・遅延評価を備えています。現在の `lang-2026` ブランチは、UI やグラフィックス機能を一切持たず、言語コアだけにフォーカスした再設計版です。

```glisp
;; 可変長の算術 — 型ごとの default が暗黙のフォールバック値
(+ 1 2 3 4 5)        ;; → 15
(* 2 3 4)            ;; → 24

;; 関数リテラル — シグネチャは明示、本体は推論
(def "double"
  (=> (n: number): number (* n 2)))

(double 7)           ;; → 14

;; パターンマッチ — 黙って fall-through、例外は出ない
(? value
  number  "数値"
  string  "文字列"
  _       "それ以外")

;; @ で明示的に型変換。失敗時は型の default に落ちる
(@ number "数値ではない")   ;; → 0  （診断あり）
```

## なぜまた Lisp？

Glisp は、**ビジュアル／構造エディタ・直接操作キャンバス・テキストエディタ・設定ファイル** といった大きく異なる編集モードの間を、同じソースが綺麗に往復することを目指して設計されています。コアは意図的に小さく、どのモードで書かれた式も意味が一義的に決まります。

具体的には：

- CST は空白とコメントを保持。GUI 編集とテキスト編集が衝突せずに往復できます。
- 評価は例外を投げません。すべての型スロットに `default` があり、ミスマッチは別レーンの診断として浮上します。
- 名前とパス（`./key`, `../arg`）は静的に解決可能。ホストはプログラムを走らせずに型や参照を表示できます。
- マクロは `expand` 1 ステップで展開、`eval` は最終形に飛びます。ホストは抽象化のはしごのどの段でも表示できます。

詳しい設計は [仕様書](/spec/) を参照。

## ステータス

`src/` 以下でコア言語を実装中。ターミナル REPL は今すぐ使えますし、[ブラウザの Playground](/ja/playground) も同じソースから動いています。

## モジュール

- [`syntax`](/spec/syntax) — 具体構文：トークン、構造、関数、メタデータ、quote。
- [`types`](/spec/types) — 型システム：値としての型、コンストラクタ、parametric IO、`@` による coerce。
- [`eval`](/spec/eval) — 評価モデル：スコープ、名前解決、遅延評価、DAG、抽象化のはしご。
- [`host-api`](/spec/host-api) — 埋め込み API：marshaling、AST/型コンビネータ、TS 型推論。
