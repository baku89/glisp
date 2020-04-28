(def TWO_PI (* PI 2))
(def HALF_PI (/ PI 2))
(def QUARTER_PI (/ PI 4))

(defn lerp
  {:doc "Calculates a number between two numbers at a specific increment"
   :params [{:type "number" :desc "First value"}
            {:type "number" :desc "Second value"}
            {:type "number" :desc "Normalized amount to interpolate between the two values"}]}
  [a b t] (+ b (* (- a b) t)))
(defn deg [x] (/ (* x 180) PI))
(defn rad [x] (/ (* x PI) 180))


;; Linear-algebra
;; Using the implementation of gl-matrix
;; http://glmatrix.net/docs/vec2.js.htm

(def .x first)
(def .y second)

;; vec2
;; http://glmatrix.net/docs/module-vec2.html

(defn vec2/uniform
  {:doc "Create vec2 with same value for x and y"
   :params [{:type "number"}]
   :return {:type "vec2"}}
  [v] [v v])

(defn vec2?
  {:doc "Check if x is vec2"
   :params [{:type "any"}]
   :return {:type "boolean"}}
  [x]
  (and
   (sequential? x)
   (>= (count x) 2)
   (number? (.x x))
   (number? (.y x))))

(defn vec2/+
  {:doc "Adds two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]
   :return {:type "vec2"}}
  [a b]
  [(+ (.x a) (.x b))
   (+ (.y a) (.y b))])

(defn vec2/-
  {:doc "Subtracts *b* from *a*"
   :params [{:type "vec2"} {:type "vec2"}]}
  [a b]
  [(- (.x a) (.x b))
   (- (.y a) (.y b))])

(defn vec2/*
  {:doc "Multiplies two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]}
  [a b]
  [(* (.x a) (.x b))
   (* (.y a) (.y b))])

(defn vec2/div
  {:doc "Divides two vec2's"
   :params [{:type "vec2"} {:type "vec2"}]}
  [a b]
  [(/ (.x a) (.x b))
   (/ (.y a) (.y b))])

(defn vec2/ceil [v]
  [(ceil (.x v)) (ceil (.y v))])

(defn vec2/floor [v]
  [(floor (.x v)) (floor (.y v))])

(defn vec2/min [v]
  [(min (.x v)) (min (.y v))])

(defn vec2/max [v]
  [(max (.x v)) (max (.y v))])

(defn vec2/round [v]
  [(round (.x v)) (round (.y v))])

(defn vec2/scale (v scalar)
  [(* scalar (.x v))
   (* scalar (.y v))])

;; a + b * scale
(defn vec2/scale-add (a b scale)
  [(+ (.x a) (* scale (.x b)))
   (+ (.y a) (* scale (.y b)))])

(defn vec2/dist [a b]
  (hypot (- (.x b) (.x a)) (- (.y b) (.y a))))

(defn vec2/len [v]
  (hypot (.x v) (.y v)))

(defn vec2/rotate [origin angle v]
  (let (ox		(.x origin)
            oy		(.y origin)
            x			(- (.x v) ox)
            y			(- (.y v) oy)
            sinC	(sin angle)
            cosC	(cos angle))
    [(+ ox (- (* x cosC) (* y sinC)))
     (+ oy (+ (* x sinC) (* y cosC)))]))

(defn vec2/negate [v]
  (vec2/scale v -1))

(defn vec2/inverse [v]
  (vec2/div (vec2 1) v))

; TODO: Should this return the original value
; when its length is zero?
(defn vec2/normalize [v]
  (let (len (vec2/len v))
    (if (> len 0)
      (vec2/scale v (/ len))
      v)))

(defn vec2/dot [a b]
  (+ (* (.x a) (.x b)) (* (.y a) (.y b))))

(defn vec2/lerp [a b t]
  [(lerp (.x a) (.x b) t)
   (lerp (.y a) (.y b) t)])

(defn vec2/transform-mat2d [a m]
  (let [x (.x a)
        y (.y a)]
    [(+ (* (nth m 0) x) (* (nth m 2) y) (nth m 4))
     (+ (* (nth m 1) x) (* (nth m 3) y) (nth m 5))]))

;; mat2d
;; http://glmatrix.net/docs/module-mat2d.html

(def mat2d/ident [1 0 0 1 0 0])

;; mat2d/fromTranslation
(defn mat2d/translate
  {:doc "Returns translation matrix"
   :params [{:label "Value" :type "vec2" :desc "Amount of translation"}]
   :return [:type "mat2d" :desc "Transform matrix"]}
  [[x y]]
  [1 0 0 1 x y])


(defn mat2d/translate-x
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :return {:type "mat2d"}}
  [x] [1 0 0 1 x 0])

(defn mat2d/translate-y
  {:doc "Returns translation matrix"
   :params [{:type "number"}]
   :return {:type "mat2d"}}
  [y] [1 0 0 1 0 y])

;; mat2d/fromScaling, scale
(defn mat2d/scale
  {:doc  "Returns scaling matrix"
   :params [{:label "Value" :type "vec2"}]
   :return {:type "mat2d"}}
  [s]
  [(.x s) 0 0 (.y s) 0 0])

(defn mat2d/scale-x
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :return {:type "mat2d"}}
  [sx] [sx 0 0 1 0 0])
(defn mat2d/scale-y
  {:doc "Returns scaling matrix"
   :params [{:type "number"}]
   :return {:type "mat2d"}}
  [sy] [1 0 0 sy 0 0])

;; mat2d/fromRotation
(defn mat2d/rotate
  {:doc "Returns rotation matrix"
   :params [{:type "number"}]
   :return {:type "mat2d"}}
  [angle]
  (let [s (sin angle)
        c (cos angle)]
    [c s (- s) c 0 0]))

(defn mat2d/mul [a b]
  (let [a0 (nth a 0)
        a1 (nth a 1)
        a2 (nth a 2)
        a3 (nth a 3)
        a4 (nth a 4)
        a5 (nth a 5)
        b0 (nth b 0)
        b1 (nth b 1)
        b2 (nth b 2)
        b3 (nth b 3)
        b4 (nth b 4)
        b5 (nth b 5)]
    [(+ (* a0 b0) (* a2 b1))
     (+ (* a1 b0) (* a3 b1))
     (+ (* a0 b2) (* a2 b3))
     (+ (* a1 b2) (* a3 b3))
     (+ (* a0 b4) (* a2 b5) a4)
     (+ (* a1 b4) (* a3 b5) a5)]))

(defn mat2d/pivot
  {:doc "Pivot"
   :params [{:label "Pos" :type "vec2"}
            {:label "Matrix" :type "mat2d" :variadic true}]}
  [p & xs]
  (let [m-first (mat2d/translate p)
        m-last (mat2d/translate (vec2/negate p))]
    (apply mat2d/transform `(~m-first ~@xs ~m-last))))

(defn mat2d/transform
  {:doc "Multiplies the matrices and returns transform matrix"
   :params [{:label "Matrix" :type "mat2d" :variadic true}]
   :return {:type "mat2d"}}
  [& xs]
  (reduce mat2d/mul mat2d/ident xs))

(def translate mat2d/translate)
(def translate-x mat2d/translate-x)
(def translate-y mat2d/translate-y)
(def scale mat2d/scale)
(def scale-x mat2d/scale-x)
(def scale-y mat2d/scale-y)
(def rotate mat2d/rotate)
(def pivot mat2d/pivot)
(def transform mat2d/transform)

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

(def combination/× combination/product)