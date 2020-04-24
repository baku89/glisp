(def TWO_PI (* PI 2))
(def HALF_PI (/ PI 2))
(def QUARTER_PI (/ PI 4))

(defn lerp [a b t] (+ b (* (- a b) t)))
(defn deg [x] (/ (* x 180) PI))
(defn rad [x] (/ (* x PI) 180))

(defn odd? [x] (= (mod x 2) 1))
(defn even? [x] (= (mod x 2) 0))


;; Linear-algebra
;; Using the implementation of gl-matrix
;; http://glmatrix.net/docs/vec2.js.htm

(def .x first)
(def .y second)

(defn vec2/uniform
  {:doc "Create vec2 with same value for x and y"}
  [v] [v v])

(defn vec2? [v]
  (and
   (sequential? v)
   (>= (count v) 2)
   (number? (.x v))
   (number? (.y v))))

(defn vec2/+ [a b]
  [(+ (.x a) (.x b))
   (+ (.y a) (.y b))])

(defn vec2/- [a b]
  [(- (.x a) (.x b))
   (- (.y a) (.y b))])

(defn vec2/*
  [a b]
  [(* (.x a) (.x b))
   (* (.y a) (.y b))])

(defn vec2/div [a b]
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

(defn vec2/rotate (origin angle v)
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

(defn rect/transform [r xform])



;; Combination
(defn combination/product [& xs]
  (vec (apply concat
              (map
               (fn (R) (map #(cons % R) (first xs)))
               (if (= 2 (count xs))
                 (last xs)
                 (apply combination/product (rest xs)))))))

(def combination/× combination/product)