(def w 20)
(def col (range -5 6))
(def grid (combination/× col col))

(def rnd #(sign (- (random %) .5)))

(defn slash (i p)
  (->> (line [(- w) (- w)] [w w])
       (scale-x (rnd i))
       (translate p)))

(->> grid
     (map #(vec2/scale % (* w 2)))
     (map-indexed slash)
     make-group
     (stroke "salmon" 10)
     (translate (vec2/scale $size .5)))