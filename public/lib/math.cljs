(import-js-force "math.js")

(def TWO_PI (* PI 2))
(def HALF_PI (/ PI 2))
(def QUARTER_PI (/ PI 4))

(defn lerp
  {:doc "Calculates a number between two numbers at a specific increment"
   :params [{:type "number" :desc "First value"}
            {:type "number" :desc "Second value"}
            {:type "number" :desc "Normalized amount to interpolate between the two values"}]
   :returns {:type "number"}}
  [a b t] (+ b (* (- a b) t)))

;; Angle Units
(defn to-deg
  {:doc "Converts an angles to degrees"
   :params [{:type "number"}]
   :returns {:type "number"}}
  [radians] (/ (* radians 180) PI))

(defn deg
  {:doc "Represents an angle in degrees"
   :params [{:type "number"}]
   :returns {:type "number"}
   :unit {:suffix "°"}
   :inverse (fn [ret] [(to-deg ret)])}
  [degrees] (/ (* degrees PI) 180))

(defn to-turn
  {:doc "Converts an angles to turn"
   :params [{:type "number"}]
   :returns {:type "number"}}
  [radians] (/ radians TWO_PI))

(defn turn
  {:doc "Represents an angle in a number of turns"
   :params [{:type "number"}]
   :returns {:type "number"}
   :unit {:suffix "turn"}
   :inverse (fn [ret] [(to-turn ret)])}
  [turn] (* turn TWO_PI))


(defn clamp
  {:doc "Clamp `x` between two other value"
   :params [{:label "x" :type "number"}
            {:label "Min" :type "number"}
            {:label "max" :type "number"}]
   :returns {:type "number"}}
  [x _min _max]
  (min (max _min x) _max))

;; Linear-algebra
;; Using the implementation of gl-matrix
;; http://glmatrix.net/docs/vec2.js.htm

(def .x
  ^{:doc "Gets x value from vec2"
    :params [{:label "Value" :type "vec2"}]
    :returns {:type "number"}}
  first)
(def .y
  ^{:doc "Gets y value from vec2"
    :params [{:label "Value" :type "vec2"}]
    :returns {:type "number"}}
  second)

;; vec2
;; http://glmatrix.net/docs/module-vec2.html

;; (defn vec2
;;   {:doc "Creates vec2. Returns [0 0] if no parameter has specified, [x x] if only `x` has specified, else [x y]"
;;    :params [[{:label "x" :type "number" :default 0}]
;;             [{:label "x" :type "number"}
;;              {:label "y" :type "number"}]]
;;    :returns {:type "vec2"}}
;;   [& xs]
;;   (case (count xs)
;;     0 [0 0]
;;     1 (let [v (first xs)] [v v])
;;     2 (vec xs)))

(defn vec2
  {:doc "Creates vec2"
   :params [{:label "Value" :type "vec2" :default [0 0]}]
   :handles {:draw (fn [{:params [x]}]
                     [{:type "translate" :pos x}])
             :drag (fn [{:pos pos}] [pos])}}
  [x] x)

(defn vec2?
  {:doc "Checks if x is vec2"
   :params [{:type "any"}]
   :returns {:type "boolean"}}
  [x]
  (and
   (sequential? x)
   (>= (count x) 2)
   (number? (.x x))
   (number? (.y x))))

(defn vec2/+
  {:doc "Adds two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [& xs]
  (reduce (fn [a b]
            [(+ (.x a) (.x b))
             (+ (.y a) (.y b))])
          [0 0]
          xs))

(defn vec2/-
  {:doc "Subtracts *b* from *a*"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [a b]
  [(- (.x a) (.x b))
   (- (.y a) (.y b))])

(defn vec2/*
  {:doc "Multiplies two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [a b]
  [(* (.x a) (.x b))
   (* (.y a) (.y b))])

(defn vec2/div
  {:doc "Divides two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [a b]
  [(/ (.x a) (.x b))
   (/ (.y a) (.y b))])

(defn vec2/ceil
  {:doc "Rounds a each element up to the next largest integer"
   :params [{:label "Value" :type "vec2"}]
   :returns {:type "vec2"}}
  [v]
  [(ceil (.x v)) (ceil (.y v))])

(defn vec2/floor
  {:doc "Replaces a each element with a largest integer less than or equal to it"
   :params [{:label "Value" :type "vec2"}]
   :returns {:type "vec2"}}
  [v]
  [(floor (.x v)) (floor (.y v))])

(defn vec2/min
  {:doc "Returns the minimum of two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [a b]
  [(min (.x a) (.y b)) (min (.y a) (.y b))])

(defn vec2/max
  {:doc "Returns the maximum of two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "vec2"}}
  [a b]
  [(max (.x a) (.y b)) (max (.y a) (.y b))])

(defn vec2/round [v]
  [(round (.x v)) (round (.y v))])

(defn vec2/dir
  {:doc "Createsa a vec2 with specified angle and length"
   :params [{:label "Angle" :type "number"}
            {:label "Length" :type "number" :default 1}]
   :returns {:type "vec2"}}
  [a & xs]
  (case (count xs)
    0 [(cos a) (sin a)]
    1 (let [l (first xs)] [(* l (cos a)) (* l (sin a))])))

(defn vec2/angle
  {:doc "Returns a angle of vec2 in radians"
   :params [{:label "Value" :type "vec2"}]
   :returns {:type "vec2"}}
  [[x y]]
  (atan2 y x))

(defn vec2/scale
  {:doc "Scales a vec2 by a scalar number"
   :params [{:label "Value" :type "vec2"}
            {:label "Scale" :type "number"}]
   :returns {:type "vec2"}}
  [v s]
  [(* s (.x v))
   (* s (.y v))])

;; a + b * scale
(defn vec2/scale-add
  {:doc "Adds two vec2's after scaling the second operand by a scalar value"
   :params [{:type "vec2"}
            {:type "vec2"}
            {:type "number"}]
   :returns {:type "vec2"}}
  [a b scale]
  [(+ (.x a) (* scale (.x b)))
   (+ (.y a) (* scale (.y b)))])

(defn vec2/dist
  {:doc "Calculate the distance between two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "number"}}
  [a b]
  (hypot (- (.x b) (.x a)) (- (.y b) (.y a))))

(defn vec2/len [v]
  (hypot (.x v) (.y v)))

(defn vec2/sqr-len [v]
  (+ (pow (.x v) 2) (pow (.y v) 2)))

(defn vec2/rotate
  {:doc "Rotates a vec2"
   :params [{:type "vec2"}
            {:type "number"}
            {:type "vec2"}]
   :returns {:type "vec2"}}
  [center angle value]
  (let [ox		(.x center)
        oy		(.y center)
        x			(- (.x value) ox)
        y			(- (.y value) oy)
        sinC	(sin angle)
        cosC	(cos angle)]
    [(+ ox (- (* x cosC) (* y sinC)))
     (+ oy (+ (* x sinC) (* y cosC)))]))

; TODO: Should this return the original value
; when its length is zero?
(defn vec2/normalize
  {:doc "Normalizes a vec2"
   :params [{:label "Value" :type "vec2"}]
   :retruns {:type "vec2"}}
  [v]
  (let [len (vec2/len v)]
    (if (> len 0)
      (vec2/scale v (/ len))
      v)))

(defn vec2/dot
  {:doc "Calculates the dot product of two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "number"}}
  [a b]
  (+ (* (.x a) (.x b)) (* (.y a) (.y b))))

(defn vec2/lerp
  {:doc "Performs a linear interpolation between two vec2's"
   :params [{:type "vec2"} {:type "vec2"} {:type "number"}]
   :returns {:type "vec2"}
   :handles {:draw (fn [{:params [a b t] :return p}]
                     [{:type "path" :class "dashed"
                       :guide true
                       :path (line a b)}
                      {:type "point" :pos p}])
             :drag (fn [{:pos p :params [a b t]}]
                     (let [ab (vec2/- b a)]
                       [a b
                        (- 1 (/ (vec2/dot (vec2/- p a) ab)
                                (vec2/sqr-len ab)))]))}}
  [a b t]
  [(lerp (.x a) (.x b) t)
   (lerp (.y a) (.y b) t)])

(defn vec2/transform-mat2d
  {:doc "Transforms the vec2 with a mat2d"
   :params [{:type "vec2"}
            {:label "Matrix" :type "mat2d"}]
   :returns {:type "vec2"}}
  [value m]
  (let [x (.x value)
        y (.y value)]
    [(+ (* (nth m 0) x) (* (nth m 2) y) (nth m 4))
     (+ (* (nth m 1) x) (* (nth m 3) y) (nth m 5))]))

;; mat2d
;; http://glmatrix.net/docs/module-mat2d.html

(defn calc-dragged-rotation
  [& xs]
  (let [options (apply hash-map xs)
        c (get options :center [0 0])
        p (vec2/- (get options :pos) c)
        pp (vec2/- (get options :prev-pos) c)
        angle (get options :angle)

        angle-pp (vec2/angle pp)
        aligned-p (vec2/rotate [0 0] (- angle-pp) p)
        angle-delta (vec2/angle aligned-p)]
    (+ angle angle-delta)))

(defn mat2d
  {:doc "Creates mat2d"
   :params [{:type "mat2d"}]
   :handles {:draw (fn [{:params [[a b c d tx ty]]}]
                     (let [t [tx ty]
                           axis-x (vec2/scale-add t [a b] 80)
                           axis-y (vec2/scale-add t [c d] 80)
                           corner (vec2/scale-add t (vec2/+ [a b] [c d]) 80)]
                       [{:id :axis-x :type "path" :class "axis-x" :guide true :path (line t axis-x)}
                        {:id :axis-y :type "path" :class "axis-y" :guide true :path (line t axis-y)}
                        {:id :r :type "path" :class "dashed" :path (circle t 40)}
                        {:id :sx :type "path" :class "dashed" :path (line axis-x corner)}
                        {:id :sy :type "path" :class "dashed" :path (line axis-y corner)}
                        {:id :x :type "point" :pos axis-x}
                        {:id :y :type "point" :pos axis-y}
                        {:id :s :type "point" :pos corner}
                        {:id :t :type "translate" :pos t}]))
             :drag (fn [{:id id
                         :pos p
                         :prev-pos pp
                         :params [m]}]
                     (let [t (take-last 2 m)
                           x (take 2 m)
                           y (slice m 2 4)]
                       (case id
                         :t [`[~@x ~@y ~@p]]
                         :x [`[~@(vec2/scale (vec2/- p t) (/ 80)) ~@y ~@t]]
                         :y [`[~@x ~@(vec2/scale (vec2/- p t) (/ 80)) ~@t]]

                         :r (let [angle-delta (calc-dragged-rotation
                                               :center t
                                               :pos p
                                               :prev-pos pp
                                               :angle 0)
                                  x (vec2/rotate [0 0] angle-delta x)
                                  y (vec2/rotate [0 0] angle-delta y)]
                              [`[~@x ~@y ~@t]])

                         ;; Scale
                         (let [s (vec2/scale (vec2/transform-mat2d p (mat2d/invert m)) (/ 80))]
                           (case id
                             :sx [`[~@(vec2/scale x (.x s)) ~@y ~@t]]
                             :sy [`[~@x ~@(vec2/scale y (.y s)) ~@t]]
                             :s [`[~@(vec2/scale x (.x s)) ~@(vec2/scale y (.y s)) ~@t]])))))}
   :returns {:type "mat2d"}}
  [x] x)

(defn mat2d?
  {:doc "Checks if x is mat2d"
   :params [{:type "any"}]
   :returns {:type "boolean"}}
  [x]
  (and
   (sequential? x)
   (= (count x) 6)))

(defn mat2d/ident
  {:doc "Returns ident matrix"
   :params []}
  []
  [1 0 0 1 0 0])

;; mat2d/fromTranslation
(defn mat2d/translate
  {:doc "Returns translation matrix"
   :params [{:label "Value" :type "vec2" :desc "Amount of translation"}]
   :returns [:type "mat2d" :desc "Transform matrix"]
   :handles {:draw (fn [{:params [pos]}]
                     [{:type "translate"
                       :pos pos}])
             :drag (fn [{:pos p}]
                     [p])}}
  [[x y]]
  [1 0 0 1 x y])


(defn mat2d/translate-x
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [{:params [x]}]
                     [{:type "path" :guide true :class "dashed"
                       :path (line [0 -80] [0 80])}
                      {:type "arrow" :pos [x 0]}])
             :drag (fn [{:pos p}]  [(.x p)])}}
  [x] [1 0 0 1 x 0])

(defn mat2d/translate-y
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :handles {:draw (fn [{:params [y]}]
                     [{:type "path" :guide true :class "dashed"
                       :path (line [-80 0] [80 0])}
                      {:type "arrow" :pos [0 y] :angle HALF_PI}])
             :drag (fn [{:pos p}]  [(.y p)])}}
  [y] [1 0 0 1 0 y])

;; mat2d/fromScaling, scale
(defn mat2d/scale
  {:doc  "Returns scaling matrix"
   :params [{:label "Value" :type "vec2"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [{:params [[x y]]}]
                     (let [sx (* x 40)
                           sy (* y 40)]
                       [{:type "path" :class "dashed" :guide true
                         :path [:path
                                :M [0 0] :L [sx 0]
                                :M [0 0] :L [0 sy]
                                :M [sx 0] :L [0 (- sy)] :L [(- sx) 0] :L [0 sy]]}
                        {:type "path"  :id :uniform :path (line [sx 0] [0 sy])}
                        {:type "translate" :id :non-uni :pos [sx sy]}
                        {:type "arrow" :id :axis-x  :pos [sx 0]}
                        {:type "arrow" :id :axis-y  :pos [0 sy] :angle HALF_PI}]))
             :drag (fn [{:id id :pos p
                         :params [[x y]]}]
                     (let [_x (/ (.x p) 40)
                           _y (/ (.y p) 40)]
                       (case id
                         :uniform [[(+ _x (* (/ x y) _y))
                                    (+ _y (* (/ y x) _x))]]
                         :non-uni [[_x _y]]
                         :axis-x  [[_x y]]
                         :axis-y  [[x _y]])))}}
  [[x y]]
  [x 0 0 y 0 0])

(defn mat2d/scale-x
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [{:params [x]}]
                     (let [sx (* x 40)]
                       [{:type "path" :class "dashed" :guide true
                         :path [:path
                                :M [0 0] :L [sx 0]
                                :L [0 -40] :L [(- sx) 0] :L [0 40] :L [sx 0]]}
                        {:type "arrow" :pos [sx 0]}]))
             :drag (fn [{:pos [px]}]
                     [(/ px 40)])}}
  [sx] [sx 0 0 1 0 0])

(defn mat2d/scale-y
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [{:params [y]}]
                     (let [sy (* y 40)]
                       [{:type "path" :class "dashed" :guide true
                         :path [:path
                                :M [0 0] :L [0 sy]
                                :L [-40 0] :L [0 (- sy)] :L [40 0] :L [0 sy]]}
                        {:type "arrow" :pos [0 sy] :angle HALF_PI}]))
             :drag (fn [{:pos [_ py]}]
                     [(/ py 40)])}}
  [sy] [1 0 0 sy 0 0])

;; mat2d/fromRotation
(defn mat2d/rotate
  {:doc "Returns rotation matrix"
   :params [{:type "angle"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [{:params [angle]}]
                     (let [dir (vec2/dir angle 80)]
                       [{:type "path" :guide true :path (line [0 0] dir)}
                        {:type "path" :guide true :class "dashed" :path (arc [0 0] 80 0 angle)}
                        {:type "point" :pos dir}]))
             :drag (fn [{:pos p :prev-pos pp :params [angle]}]
                     [(calc-dragged-rotation
                       :pos p
                       :prev-pos pp
                       :angle angle)])}}
  [angle]
  (let [s (sin angle)
        c (cos angle)]
    [c s (- s) c 0 0]))

(defn mat2d/invert
  {:doc "Inverts `matrix`"
   :params [{:label "Matrix" :type "mat2d"}]}
  [[aa ab ac ad atx aty]]
  (let [det (- (* aa ad) (* ab ac))]
    (if (zero? det)
      nil
      (let [det-inv (/ det)]
        [(* ad det-inv)
         (* (- ab) det-inv)
         (* (- ac) det-inv)
         (* aa det-inv)
         (* (- (* ac aty) (* ad atx)) det-inv)
         (* (- (* ab atx) (* aa aty)) det-inv)]))))

(def mat2d/*
  ^{:doc "Multipies the mat2d's"
    :params [&
             {:label "Matrix" :type "mat2d"}]
    :returns {:type "mat2d"}}
  (let
   [mul (fn
          [[a0 a1 a2 a3 a4 a5]
           [b0 b1 b2 b3 b4 b5]]
          [(+ (* a0 b0) (* a2 b1))
           (+ (* a1 b0) (* a3 b1))
           (+ (* a0 b2) (* a2 b3))
           (+ (* a1 b2) (* a3 b3))
           (+ (* a0 b4) (* a2 b5) a4)
           (+ (* a1 b4) (* a3 b5) a5)])]
    (fn [& xs] (reduce mul (mat2d/ident) xs))))

(defn mat2d/pivot
  {:doc "Pivot"
   :params [{:label "Pos" :type "vec2"}
            &
            {:label "Matrix" :type "mat2d"}]
   :returns "mat2d"
   :handles {:draw (fn [{:params [p]}]
                     [{:type "translate" :pos p}])
             :drag (fn [{:pos p :params [_ & xs]}]
                     `(~p ~@xs))}}
  [p & xs]
  (let [m-first (mat2d/translate p)
        m-last (mat2d/translate (vec2/scale p -1))]
    (apply mat2d/* `(~m-first ~@xs ~m-last))))

(defalias translate mat2d/translate)
(defalias translate-x mat2d/translate-x)
(defalias translate-y mat2d/translate-y)
(defalias scale mat2d/scale)
(defalias scale-x mat2d/scale-x)
(defalias scale-y mat2d/scale-y)
(defalias rotate mat2d/rotate)
(defalias pivot mat2d/pivot)

;; Rect
;; http://paperjs.org/reference/rectangle/

(defn rect2d
  {:doc "Creates a rectangle representing a region"
   :params [{:label "x" :type "rect2d"}]
   :handles
   {:draw (fn [{:params [[x y w h]]}]
            [; center
             {:type "translate" :id :center
              :pos (vec2/scale-add [x y] [w h] .5)}
             ; edges
             {:type "path" :id :left :path (line [x y] [x (+ y h)])}
             {:type "path" :id :top :path (line [x y] [(+ x w) y])}
             {:type "path" :id :right :path (line [(+ x w) y] (vec2/+ [x y] [w h]))}
             {:type "path" :id :bottom :path (line [x (+ y h)] (vec2/+ [x y] [w h]))}
             ; corners
             {:type "point" :id :top-left :pos [x y]}
             {:type "point" :id :top-right :pos [(+ x w) y]}
             {:type "point" :id :bottom-left :pos [x (+ y h)]}
             {:type "point" :id :bottom-right :pos (vec2/+ [x y] [w h])}])
    :drag (fn [{:id id :pos p
                :delta-pos [dx dy]
                :params [[x y w h]]}]
            (case id
              :center [[(+ x dx) (+ y dy) w h]]
              :left  [[(+ x dx) y (- w dx) h]]
              :top   [[x (+ y dy) w (- h dy)]]
              :right [[x y (+ w dx) h]]
              :bottom [[x y w (+ h dy)]]
              :top-left [`[~@p ~@(vec2/- (vec2/+ [x y] [w h]) p)]]
              :top-right [[x (.y p) (- (.x p) x) (- (+ y h) (.y p))]]
              :bottom-left [[(.x p) y (- (+ x w) (.x p)) (- (.y p) y)]]
              :bottom-right [`[~x ~y ~@(vec2/- p [x y])]]))}}
  [[x y w h]] [x y w h])

(def rect2d/left first)
(def rect2d/top second)
(defn rect2d/right [r] (+ (nth r 0) (nth r 2)))
(defn rect2d/bottom [r] (+ (nth r 1) (nth r 3)))
(defn rect2d/center [[x y w h]] [(+ x (/ w 2)) (+ y (/ h 2))])

(defn rect2d/width [r] (nth r 2))
(defn rect2d/height [r] (nth r 3))

(defn rect2d/point [r] (vec (take 2 r)))
(defn rect2d/size [r] (vec (drop 2 r)))

(def rect2d/top-left rect2d/point)
(defn rect2d/bottom-right [r] (vec2/+ (rect2d/point r) (rect2d/size r)))

(defn rect2d/from-to
  {:doc "Creates a bound from two corners"
   :inverse (fn [[x y w h]] [[x y] [(+ x w) (+ y h)]])
   :handles {:draw (fn [{:params [from to] :return ret}]
                     [{:type "path" :guide true :class "dashed"
                       :path (rect ret)}
                      {:id :from :type "translate" :pos from}
                      {:id :to :type "translate" :pos to}])
             :drag (fn [{:id id :pos p :params [from to]}]
                     (case id
                       :from [p to]
                       :to [from p]))}
   :returns {:type "rect2d"}}
  [from to]
  [(min (.x from) (.x to))
   (min (.y from) (.y to))
   (abs (- (.x to) (.x from)))
   (abs (- (.y to) (.y from)))])

(defn rect2d/expand
  {:doc "Expands a bound by horizontal and vertical amounts"
   :params [{:label "Horizontal" :type "number"}
            {:label "Vertical" :type "number"}
            {:label "Bound" :type "rect2d"}]
   :handles {:draw (fn [{:params [h v r] :return ret}]
                     (let [c (rect2d/center r)]
                       [{:type "path" :guide true :class "dashed"
                         :path (rect r)}
                        {:id :left :type "arrow"
                         :pos [(- (rect2d/left r) h) (.y c)]}
                        {:id :right :type "arrow"
                         :pos [(+ (rect2d/right r) h) (.y c)]}
                        {:id :top :type "arrow" :angle HALF_PI
                         :pos [(.x c) (- (rect2d/top r) v)]}
                        {:id :bottom :type "arrow" :angle HALF_PI
                         :pos [(.x c) (+ (rect2d/bottom r) v)]}]))
             :drag (fn [{:id id :pos [px py] :params [h v r]}]
                     (case id
                       :left [(- (rect2d/left r) px) v r]
                       :right [(- px (rect2d/right r)) v r]
                       :top [h (- (rect2d/top r) py) r]
                       :bottom [h (- py (rect2d/bottom r)) r]))}
   :inverse (fn [ret [h v src]]
              (let [old-ret (rect2d/expand h v src)
                    h (if (!= (rect2d/left old-ret)
                              (rect2d/left ret))
                        (- (rect2d/left src) (rect2d/left ret))
                        (- (rect2d/right ret) (rect2d/right src)))
                    v (if (!= (rect2d/top old-ret)
                              (rect2d/top ret))
                        (- (rect2d/top src) (rect2d/top ret))
                        (- (rect2d/bottom ret) (rect2d/bottom src)))]
                [h v src]))
   :returns {:type "rect2d"}}
  [horiz vert r]
  [(- (rect2d/left r) horiz)
   (- (rect2d/top r) vert)
   (+ (rect2d/width r) (* 2 horiz))
   (+ (rect2d/height r) (* 2 vert))])

(defn rect2d/union [a b]
  (rect2d/from-to
   [(min (rect2d/left a) (rect2d/left b))
    (min (rect2d/top a) (rect2d/top b))]
   [(max (rect2d/right a) (rect2d/right b))
    (max (rect2d/bottom a) (rect2d/bottom b))]))


;; Combination
(defn combination/product [& xs]
  (if (=  1 (count xs))
    (map #(vector %) (first xs))
    (apply concat
           (map
            (fn (R) (map #(vec (cons R %)) (last xs)))
            (if (= 2 (count xs))
              (first xs)
              (apply combination/product (butlast xs)))))))

(defn combination/combinations [coll n]
  (cond
    (< (count coll) n) []
    (= n 1) (map vector coll)
    :else
    (vec
     (apply
      concat
      (for [fst (drop-last (dec n) coll)
            :index i]
        (map
         (fn [r] (vec (concat [fst] r)))
         (combination/combinations (drop (inc i) coll)
                                   (dec n))))))))