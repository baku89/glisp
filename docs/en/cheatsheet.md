# Cheat Sheet

Please find [Grammar of Lisp](syntax) for the basic grammar.  
This document is merely a cheat sheet.

### Sketch

```clojure
;; define a path
(def p (rect [10 10 50 50]))

;; transformation
(translate [10 10])
(scale [(pct 50) 1])
(rotate (deg 45))
(mat2d/* (translate-x 10) ; combine several transforms
         (rotate PI)
         (scale [2 2]))
(pivot [40 40] (rotate (deg 120))) ; anchor point (pivoting)
(view-center)
(path/align-at .5 p)

(transform (translate [50 50]) p) ; apply transform

;; styling
(style (fill "red") p)
(style (stroke "blue" 20) p) ; -> width = 20
(style (stroke "blue" 20 :cap "round") p)

;; path
(rect [0 0 20 20])
(circle [0 0] 100)
(line [0 0] [100 100])
(ellipse [0 0] [40 60])
(ngon [0 0] 100 5)
(polyline [20 -20] [0 0] [20 20])
(polygon [20 -20] [0 0] [20 20])

;; path operations
(def A (circle [0 0] 40))
(def B (rect [ 20 20 40 40]))

(path/merge A B)
(path/unite A B)
(path/subtract A B)
(path/intersect A B)

(path/offset 10 B)
(path/offset-stroke 2 A)

;; vector manipulation
[0 1]
(vec2 [1 2])
(.x [10 20])
(.y [30 40])
(vec2/+ [10 20] [30 40])
(vec2/scale [2 3] 0.5)
(vec2/normalize [20 20])

;; canvas background
(background "blue")

;; artboard
(artboard {:bounds [10 10 50 50]
           :background "red"}
 (circle [0 0] 40))

;; colors
"#ff0000"
"red"
(color 1 0 0)
(color 0.5) ; 50% grey


```

### Syntax

```clojure

;; literal
3.14159
"String"
:keyword
symbol
(+ 1 2)        ; List
[0 1 2 3 4 5]  ; Vector
{:key "value"} ; Map

;; define a value
(def a 10)
(let [b 10]
     (* b 2)) ; -> 10 (lexical scoping)


;; arithmetic operations
(+ 1 2)    ; -> 3
(/ 20 5)   ; -> 4
(- 10)     ; -> 10
(mod 12 5) ; -> 2
(sqrt 9)   ; -> 3
PI
TWO_PI
HALF_PI
E

;; vector operations in 2D space
(vec2/+ [1 2] [50 50]) ; -> [51 52]
(vec2/normalize [2 2]) ; -> [0.7071 0.7071]
(vec2/angle [0 1]) ; -> 1.5707 (HALF_PI)

;; logical operations
(= 1 1) ; -> true
(> 2 3) ; -> false
(not true) ; -> false
(and true false) ; -> false
(or false false true) ; -> true


;; define a function
(defn square [x]
 (* x x))

(square 5) ;-> 25


;; conditional operators
(if true "x is true" "x is false") ; -> "x is true"

(do (def x 10)
    (def y 50)
    (* x y)) ; -> 500 (the last line is returned)

(cond (zero? a) "a is zero"
      (even? a) "a is even"
      :else "a is odd") ; -> "a is even"

(case a
      0 "a is zero"
      1 "a is one"
      "a is neither zero or one" ; -> "a is neither..


;; miscellaneous
(println "Hello World")
(prn PI)

```
