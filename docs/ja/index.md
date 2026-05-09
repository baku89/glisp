---
home: true
heroImage: /logo.svg
heroHeight: 160
actions:
  - text: ガイド →
    link: /ja/guide

features:
  - title: 組み込みのために設計
    details: クリエイティブソフトウェア（デザインツール、モーションエディタ、ジェネラティブパイプライン）の中で動かすための小さな言語。ホスト側が型付きの bind を渡し、Glisp がそれをつなぎます。
  - title: 構造的に双方向編集できる
    details: CST が空白もコメントも保持してラウンドトリップ。ブロック型 GUI・直接操作キャンバス・テキストエディタが、同じファイルを取り合わずに編集できます。
  - title: 失敗はデータ
    details: 評価は決して例外を投げません。型スロットは黙って default に落ち、ミスマッチは別レーンの診断として浮上。ホストは常に表示できる値を持っています。
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

Glisp は、**クリエイティブソフトウェアの中に住む**ことを目的に設計された小さな言語です。前身プロジェクト [_Glisp: A Lisp-based Design Tool Bridging Graphic Design and Computational Arts_](https://baku89.com/glisp) で探ってきた「直接操作とコードが同じ生地でつながるデザインツール」というアイデアを、このブランチでは **言語コア** として切り出して、他のツールから素直に組み込めるよう整えています。

設計の宛先は、**同じプロジェクトファイル** が次のすべてを兼ねるツールです：

- ブロック単位で構造的に編集できる（Scratch 的な）
- キャンバス上で直接操作できる（Photoshop 的に、内部の AST を裏で書き換えながら）
- テキストエディタで普通にコードとして書ける
- 静的な設定ファイルとしてシリアライズしても、「たまたまプログラマブルなだけ」として読める

言語仕様の判断のほとんどは、この目的から導かれています。

```glisp
;; ホスト側がキャンバス用のプリミティブを bind する例
(def "circle"
  (=> (cx: number cy: number r: number): Shape ...))

;; ユーザのプロジェクトファイルは静的なデータと計算値を混ぜて書ける
{
  size = 200
  half = (/ size 2 %)
  ^{label: "背景"}
  bg   = (rect 0 0 size size)

  ^{color: "#ff7b72" label: "ドット"}
  dot  = (circle half half (* 0.2 size %))

  [bg dot]
}

;; GUI エディタはスライダで `size` を直接動かせる。AST は canonical なまま、
;; コメント・メタデータもラウンドトリップする。同じファイルをそのまま vim で
;; 開いてもちゃんと Glisp プログラム。
```

## なぜ Lisp なのか

クリエイティブツールでは、**コード・ブロック・直接操作** が「同じものの違うビュー」になっていてほしい。別モードとして並走させると衝突するからです。S 式の **コード = データ** はその一致を最も安く実現します。AST はホストが GUI を描くのに既に必要としているデータそのもので、ブロックエディタとテキストエディタは翻訳なしに同じツリーを編集できます。

加えて S 式は parser の実装が極端に小さいので、ブラウザ・プラグイン・サーバなど色んな場所に埋め込んで配るのも現実的です。

## なぜ「この」設計なのか

コアの判断ひとつひとつが、クリエイティブソフトの実装で必ず当たる問題に対応しています：

- **CST が trivia を保持** → GUI 編集とテキスト編集がラウンドトリップ。コメントもフォーマットも消えない。
- **評価は例外を投げない** → 編集途中のプログラムでもキャンバスは描き続けられる。型ミスマッチは診断としてレーンを変えて出る。
- **parametric `(IO T)` と構造的関数型** → ホストの副作用を Haskell ほど厳しくない型で正確に表せる。
- **パス参照（`./key`, `../arg`）** → GUI がノードどうしを「構造アドレス」で結べる。新しい名前を作る必要がない。
- **`expand` / 抽象化のはしご** → ソースから結果までのどの段でもホストが見せられる。デザイナがマクロを高位から低位へリアルタイムに drill down できる。
- **静的な名前解決** → プログラムを実行せずに型と参照を GUI に表示できる。

詳しい設計動機は [仕様書](../spec/README.md) を参照。

## ステータス

`src/` 以下で言語コアを実装中。ターミナル REPL はすぐ使えますし、[ブラウザの Playground](./playground.md) も同じソースから動いています。ホスト連携の API は [`host-api`](../spec/host-api.md) にまとめてあります。

## どこを読めばよいか

- [`syntax`](../spec/syntax.md) 具体構文。トークン、構造、関数、メタデータ、quote。
- [`types`](../spec/types.md) 型システム。値としての型、コンストラクタ、parametric IO、`@` による coerce。
- [`eval`](../spec/eval.md) 評価モデル。スコープ、遅延評価、DAG、診断、抽象化のはしご。
- [`host-api`](../spec/host-api.md) 埋め込み API。marshaling、AST/型コンビネータ、TS 型推論。
