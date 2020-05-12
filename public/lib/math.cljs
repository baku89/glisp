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
(defn to-deg
  {:doc "Converts an angles to degrees"
   :params [{:type "number"}]
   :returns {:type "number"}}
  [radians] (/ (* radians 180) PI))
(defn deg
  {:doc "Represents an angle in degrees"
   :params [{:type "number"}]
   :returns {:type "number"}}
  [degrees] (/ (* degrees PI) 180))


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

(defn vec2
  {:doc "Creates vec2. Returns [0 0] if no parameter has specified, [x x] if only `x` has specified, else [x y]"
   :params [[{:label "x" :type "number" :default 0}]
            [{:label "x" :type "number"}
             {:label "y" :type "number"}]]
   :returns {:type "vec2"}}
  [& xs]
  (case (count xs)
    0 [0 0]
    1 (let [v (first xs)] [v v])
    2 (vec xs)))

(defn vec2/init
  {:doc "Creates vec2"
   :params [{:label "Value" :type "vec2" :default [0 0]}]
   :handles {:draw (fn [[val]] [{:type "point" :id :pos :class "translate" :pos val}])
             :on-drag (fn [{pos :pos}] [pos])}}
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
  [a b]
  [(+ (.x a) (.x b))
   (+ (.y a) (.y b))])

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

(defn vec2/rotate
  {:doc "Rotates a vec2"
   :params [{:type "vec2"}
            {:type "number"}
            {:type "vec2"}]
   :returns {:type "vec2"}}
  [center angle value]
  (let (ox		(.x center)
            oy		(.y center)
            x			(- (.x value) ox)
            y			(- (.y value) oy)
            sinC	(sin angle)
            cosC	(cos angle))
    [(+ ox (- (* x cosC) (* y sinC)))
     (+ oy (+ (* x sinC) (* y cosC)))]))

; TODO: Should this return the original value
; when its length is zero?
(defn vec2/normalize
  {:doc "Normalizes a vec2"
   :params [{:label "Value" :type "vec2"}]
   :retruns {:type "vec2"}}
  [v]
  (let [len (vec2/len v)])
  (if (> len 0)
    (vec2/scale v (/ len))
    v))

(defn vec2/dot
  {:doc "Calculates the dot product of two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :returns {:type "number"}}
  [a b]
  (+ (* (.x a) (.x b)) (* (.y a) (.y b))))

(defn vec2/lerp
  {:doc "Performs a linear interpolation between two vec2's"
   :params [{:type "vec2"} {:type "vec2"} {:type "number"}]
   :returns {:type "vec2"}}
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

(defn mat2d
  {:doc "Creates mat2d"
   :params [{:label "a" :type "number"}
            {:label "b" :type "number"}
            {:label "c" :type "number"}
            {:label "d" :type "number"}
            {:label "tx" :type "number"}
            {:label "ty" :type "number"}]
   :returns {:type "mat2d"}}
  [& xs]
  (case (count xs)
    0 mat2d/ident
    6 (vec xs)
    (throw "Invalid number of arguments")))

(def mat2d/init mat2d)

(defn mat2d?
  {:doc "Checks if x is mat2d"
   :params [{:type "any"}]
   :returns {:type "boolean"}}
  [x]
  (and
   (sequential? x)
   (= (count x) 6)))

(def mat2d/ident [1 0 0 1 0 0])

;; mat2d/fromTranslation
(defn mat2d/translate
  {:doc "Returns translation matrix"
   :params [{:label "Value" :type "vec2" :desc "Amount of translation"}]
   :returns [:type "mat2d" :desc "Transform matrix"]
   :handles {:draw (fn [[pos]]
                     [{:type "point"
                       :class "translate"
                       :pos pos}])
             :on-drag (fn [{p :pos}]
                        [p])}}
  [[x y]]
  [1 0 0 1 x y])


(defn mat2d/translate-x
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [[x]]
                     [{:type "path" :guide true :class "dashed" :path (line [0 -80] [0 80])}
                      {:type "arrow" :pos [x 0]}])
             :on-drag (fn [{p :pos}]
                        [(.x p)])}}
  [x] [1 0 0 1 x 0])

(defn mat2d/translate-y
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}}
  [y] [1 0 0 1 0 y])

;; mat2d/fromScaling, scale
(defn mat2d/scale
  {:doc  "Returns scaling matrix"
   :params [{:label "Value" :type "vec2"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [[[x y]]]
                     (let [sx (* x 40)
                           sy (* y 40)]
                       [{:type "path" :class "dashed" :guide true
                         :path [:path
                                :M [0 0] :L [sx 0]
                                :M [0 0] :L [0 sy]]}
                        {:type "path"  :id :uniform :path (line [sx 0] [0 sy])}
                        {:type "point" :id :non-uni :pos [sx sy] :class "translate"}
                        {:type "point" :id :axis-x  :pos [sx 0]}
                        {:type "point" :id :axis-y  :pos [0 sy]}]))
             :on-drag (fn [{id :id p :pos} [[x y]] [[x0 y0]]]
                        (let [$x (/ (.x p) 40)
                              $y (/ (.y p) 40)]
                          (case id
                            :uniform [[(+ $x (* (/ x0 y0) $y))
                                       (+ $y (* (/ y0 x0) $x))]]
                            :non-uni [[$x $y]]
                            :axis-x  [[$x y]]
                            :axis-y  [[x $y]])))}}
  [[x y]]
  [x 0 0 y 0 0])

(defn mat2d/scale-x
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}}
  [sx] [sx 0 0 1 0 0])
(defn mat2d/scale-y
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}}
  [sy] [1 0 0 sy 0 0])

;; mat2d/fromRotation
(defn mat2d/rotate
  {:doc "Returns rotation matrix"
   :params [{:type "number"}]
   :returns {:type "mat2d"}
   :handles {:draw (fn [[angle]]
                     (let [dir (vec2/dir angle 80)]
                       [{:type "path" :guide true :path (line [0 0] dir)}
                        {:type "path" :guide true :class "dashed" :path (arc [0 0] 80 0 angle)}
                        {:type "point" :pos dir}]))
             :on-drag (fn [{p :pos pp :prev-pos} _ [angle]]
                        (let [angle-pp (vec2/angle pp)
                              aligned-p (vec2/rotate [0 0] (- angle-pp) p)
                              angle-delta (vec2/angle aligned-p)]
                          [(+ angle angle-delta)]))}}
  [angle]
  (let [s (sin angle)
        c (cos angle)]
    [c s (- s) c 0 0]))

(defn mat2d/mul
  {:doc "Multipies two mat2d's"
   :params [{:label "a" :type "mat2d"}
            {:label "b" :type "mat2d"}]
   :returns {:type "mat2d"}}
  [[a0 a1 a2 a3 a4 a5]
   [b0 b1 b2 b3 b4 b5]]
  [(+ (* a0 b0) (* a2 b1))
   (+ (* a1 b0) (* a3 b1))
   (+ (* a0 b2) (* a2 b3))
   (+ (* a1 b2) (* a3 b3))
   (+ (* a0 b4) (* a2 b5) a4)
   (+ (* a1 b4) (* a3 b5) a5)])


(defn mat2d/pivot
  {:doc "Pivot"
   :params [{:label "Pos" :type "vec2"}
            &
            {:label "Matrix" :type "mat2d"}]
   :returns "mat2d"
   :handles {:draw (fn [[p]]
                     [{:type "point" :class "translate" :pos p}])
             :on-drag (fn [{p :pos} [_ & xs]]
                        `(~p ~@xs))}}
  [p & xs]
  (let [m-first (mat2d/translate p)
        m-last (mat2d/translate (vec2/scale p -1))]
    (apply mat2d/transform `(~m-first ~@xs ~m-last))))


(defn mat2d/transform
  {:doc "Multiplies the matrices and returns transform matrix"
   :params [& {:label "Matrix" :type "mat2d"}]
   :returns {:type "mat2d"}}
  [& xs]
  (reduce mat2d/mul mat2d/ident xs))

(defalias translate mat2d/translate)
(defalias translate-x mat2d/translate-x)
(defalias translate-y mat2d/translate-y)
(defalias scale mat2d/scale)
(defalias scale-x mat2d/scale-x)
(defalias scale-y mat2d/scale-y)
(defalias rotate mat2d/rotate)
(defalias pivot mat2d/pivot)
(defalias transform mat2d/transform)

;; Rect
;; http://paperjs.org/reference/rectangle/

(def rect/left first)
(def rect/top second)
(defn rect/right [r] (+ (nth r 0) (nth r 2)))
(defn rect/bottom [r] (+ (nth r 1) (nth r 3)))

(defn rect/width [r] (nth r 2))
(defn rect/height [r] (nth r 3))

(defn rect/point [r] (vec (slice r 0 2)))
(defn rect/size [r] (vec (slice r 2)))

(def rect/top-left rect/point)
(defn rect/bottom-right [r] (vec2/+ (rect/point r) (rect/size r)))

(defn rect/from-to [from to]
  [(min (.x from) (.x to))
   (min (.y from) (.y to))
   (abs (- (.x to) (.x from)))
   (abs (- (.y to) (.y from)))])

(defn rect/expand [amount r]
  (cond (number? amount) [(- (nth r 0) amount)
                          (- (nth r 1) amount)
                          (+ (nth r 2) (* 2 amount))
                          (+ (nth r 3) (* 2 amount))]
        (vec2? amount) [(- (nth r 0) (.x amount))
                        (- (nth r 1) (.y amount))
                        (+ (nth r 2) (* 2 (.x amount)))
                        (+ (nth r 3) (* 2 (.y amount)))]
        :else (throw "[rect/expand] Invalid amount")))

(defn rect/union [a b]
  (rect/from-to
   [(min (rect/left a) (rect/left b))
    (min (rect/top a) (rect/top b))]
   [(max (rect/right a) (rect/right b))
    (max (rect/bottom a) (rect/bottom b))]))

;; Combination
(defn combination/product [& xs]
  (if (=  1 (count xs))
    (map list (first xs))
    (apply concat
           (map
            (fn (R) (map #(cons R %) (last xs)))
            (if (= 2 (count xs))
              (first xs)
              (apply combination/product (butlast xs)))))))