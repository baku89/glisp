;; Example: 10 PRINT CHR$(205.5+RND(1)); : GOTO 10
;; https://10print.org/

(def w 40)
(def s (/ w 2))

(defn slash [p]
  (->> (line [(- s) (- s)] [s s])
       (path/scale-x [(compare (rnd p) .5)])
       (path/translate p)))

(background "snow")

[:g {:transform (view-center)
     :style (stroke "salmon" 10)}
 (for [y (column -5 5 w)
       x (column -5 5 w)]
   (slash [x y]))]