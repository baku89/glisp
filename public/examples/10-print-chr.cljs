;; Example: 10 PRINT CHR$(205.5+RND(1)); : GOTO 10
;; https://10print.org/

(def w 36)
(def s (/ w 2))

(defn slash [i p]
  (path/transform
   (mat2d/* (translate p)
            (scale-x (compare (rnd i) .5)))
   (line [(- s) (- s)] [s s])))

(background "snow")

(g {:transform (translate (view-center))
    :style (stroke "salmon" 10)}
   (for [y (column -5 5 w)
         x (column -5 5 w)
         :index i]
     (slash i [x y])))