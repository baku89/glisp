;; Example: 10 PRINT CHR$(205.5+RND(1)); : GOTO 10
;; https://10print.org/

(def w 54)
(def s (/ w 2))

(defn slash [i p]
  (->> (line (vec2 (- s)) (vec2 s))
       (path/scale-x [(compare (rnd i) .5)])
       (path/translate p)))

(background "snow")

[:g {:transform (view-center)
     :style (stroke "salmon" 4)}
 (for [y (column -5 5 w)
       x (column -5 5 w)
       :index i]
   (slash i [x y]))]