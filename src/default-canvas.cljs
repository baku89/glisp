(def w 20)
(def col (range -5 6))
(def grid (combination/× col col))

(def rnd #(sign (- (random %) .5)))

(defn slash (i p)
  (->> (line (- w) (- w) w w)
       (scale (rnd i) 1)
       (translate (.x p) (.y p))))

:start-sketch
(background "whitesmoke")

(->> grid
     (map #(vec2/scale % (* w 2)))
     (map-indexed slash)
     (stroke "salmon" 7)
     (translate (/ $width 2) (/ $height 2)))
