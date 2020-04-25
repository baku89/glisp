(def w 20)
(def col (range -5 6))
(def grid (combination/× col col))

(defn slash (i p)
  (->> (line [(- w) (- w)] [w w])
       (scale-x (compare (random i) .5))
       (translate p)))

(->> grid
     (map #(vec2/scale % (* w 2)))
     (map-indexed slash)
     g
     (stroke "salmon" 10)
     (translate (vec2/scale $size .5)))