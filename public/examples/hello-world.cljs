;; Example: Hello World

(background "darkblue")

;; The basic syntax is almost same as Hiccup and Dali
;; https://github.com/stathissideris/dali/blob/master/doc/syntax.md

[:transform (translate [150 150])
 ;; Imagine former line as:
 ;; <g style="transform: translate(150, 150)">

 ;; Circle
 [:style (fill "#f2ff53")
  (circle [0 0] 100)]

 ;; Text
 [:style (fill "#ff4684")
  (text "Hello World" [0 0] :size 25)]]