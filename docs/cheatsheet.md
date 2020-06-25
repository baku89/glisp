# チートシート

基礎的な文法は[Lisp の文法](../syntax)を参照。  
雰囲気で理解出来る方向け。

### スケッチ

```clojure
;; パスの定義
(def p (rect [10 10] [50 50]))

;; トランスフォーム
(translate [10 10])
(scale [(percent 50) 1])
(rotate (deg 45))
(mat2d/* (translate-x 10) ; 複数のトランスフォームを組み合わる
         (rotate PI)
         (scale [2 2]))
(pivot [40 40] (rotate (deg 120))) ; アンカーポイント
(view-center)
(path/align-at .5 p)

(transform (translate [50 50]) p) ; トランスフォームの適用

;; スタイル
(style (fill "red") p)
(style (stroke "blue") p)
(style (stroke "blue" 20) p) ; -> width = 20
(style (stroke "blue" 20 :cap "round") p)

;; パス
(rect [0 0 20 20])
(circle [0 0] 100)
(line [0 0] [100 100])
(ellipse [0 0] [40 60])
(ngon [0 0] 100 5)
(polyline [20 -20] [0 0] [20 20])
(polygon [20 -20] [0 0] [20 20])

;; パスの変形
(def A (circle [0 0] 40))
(def B (rect [ 20 20] [40 40]))

(path/merge A B)
(path/unite A B)
(path/subtract A B)
(path/intersect A B)

(path/offset 10 B)
(path/offset-stroke 2 A)

;; 画面全体の背景色
(background "blue")

;; アートボード
(artboard {:bounds [10 10 50 50]
           :background "red"}
 (circle [0 0] 40))

;; カラー
"#ff0000"
"red"
(color 1 0 0)
(color 0.5) ; 50%グレー


```

### シンタックス

```clojure

;; リテラル
3.14159
"String"
:keyword
symbol
(+ 1 2)        ; List
[0 1 2 3 4 5]  ; Vector
{:key "value"} ; Map

;; 変数の宣言
(def a 10)
(let [b 10]
     (* b 2)) ; -> 10 (レキシカルスコープ)


;; 計算
(+ 1 2)    ; -> 3
(/ 20 5)   ; -> 4
(- 10)     ; -> 10
(mod 12 5) ; -> 2
(sqrt 9)   ; -> 3
PI
TWO_PI
HALF_PI
E

;; ベクトル
(vec2/+ [1 2] [50 50]) ; -> [51 52]
(vec2/normalize [2 2]) ; -> [0.7071 0.7071]
(vec2/angle [0 1]) ; -> 1.5707 (HALF_PI)

;; 論理演算子
(= 1 1) ; -> true
(> 2 3) ; -> false
(not true) ; -> false
(and true false) ; -> false
(or false false true) ; -> true


;; 関数の定義
(defn square [x]
 (* x x))

(square 5) ;-> 25


;; 条件分岐など
(if true "x is true" "x is false") ; -> "x is true"

(do (def x 10)
    (def y 50)
    (* x y)) ; -> 500 (最後の文が返される)

(cond (zero? a) "a is zero"
      (even? a) "a is even"
      :else "a is odd") ; -> "a is even"

(case a
      0 "a is zero"
      1 "a is one"
      "a is neither zero or one" ; -> "a is neither..


;; その他
(println "Hello World")
(prn PI)

```
