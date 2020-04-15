(def TWO_PI (* PI 2))
(def HALF_PI (/ PI 2))
(def QUARTER_PI (/ PI 4))

(defn lerp (a b t) (+ b (* (- a b) t)))
(defn deg (x) (/ (* x 180) PI))
(defn rad (x) (/ (* x PI) 180))
(defn distance (x1 y1 x2 y2)
  (sqrt (+ (pow (- x2 x1) 2) (pow (- y2 y1) 2))))

(defn odd? (x) (= (mod x 2) 1))
(defn even? (x) (= (mod x 2) 0))


;; Linear-algebra
;; Using the implementation of gl-matrix
;; http://glmatrix.net/docs/vec2.js.htm

(def .x first)
(def .y second)

(defn vec2? (v)
  (and
   (list? v)
   (= (count v) 2)
   (number? (.x v))
   (number? (.y v))))

(defn vec2/+ (a b)
  (list (+ (.x a) (.x b))
        (+ (.y a) (.y b))))

(defn vec2/- (a b)
  (list (- (.x a) (.x b))
        (- (.y a) (.y b))))

(defn vec2/* (a b)
  (list (* (.x a) (.x b))
        (* (.y a) (.y b))))

(defn vec2/div (a b)
  (list (/ (.x a) (.x b))
        (/ (.y a) (.y b))))

(defn vec2/ceil (v)
  (list (ceil (.x v)) (ceil (.y v))))

(defn vec2/floor (v)
  (list (floor (.x v)) (floor (.y v))))

(defn vec2/min (v)
  (list (min (.x v)) (min (.y v))))

(defn vec2/max (v)
  (list (max (.x v)) (max (.y v))))

(defn vec2/round (v)
  (list (round (.x v)) (round (.y v))))

(defn vec2/scale (v scalar)
  (list (* scalar (.x v))
        (* scalar (.y v))))

;; a + b * scale
(defn vec2/scale-add (a b scale)
  (list (+ (.x a) (* scale (.x b)))
        (+ (.y a) (* scale (.y b)))))

(defn vec2/dist (a b)
  (hypot (- (.x b) (.x a)) (- (.y b) (.y a))))

(defn vec2/len (v)
  (hypot (.x v) (.y v)))

(defn vec2/rotate (origin angle v)
  (let (ox		(.x origin)
            oy		(.y origin)
            x			(- (.x v) ox)
            y			(- (.y v) oy)
            sinC	(sin angle)
            cosC	(cos angle))
    (list (+ ox (- (* x cosC) (* y sinC)))
          (+ oy (+ (* x sinC) (* y cosC))))))

(defn vec2/negate (v)
  (vec2/scale v -1))

(defn vec2/inverse (v)
  (vec2/div '(1 1) v))

; TODO: Should this return the original value
; when its length is zero?
(defn vec2/normalize (v)
  (let (len (vec2/len v))
    (if (> len 0)
      (vec2/scale v (/ len))
      v)))

(defn vec2/dot (a b)
  (+ (* (.x a) (.x b)) (* (.y a) (.y b))))

(defn vec2/lerp (a b t)
  (list (lerp (.x a) (.x b) t)
        (lerp (.y a) (.y b) t)))


;; Combination

(defn combination/product (& xs)
  (apply concat
         (map
          (fn (R) (map #(cons % R) (first xs)))
          (if (= 2 (count xs))
            (last xs)
            (apply combination/product (rest xs))))))

(def combination/× combination/product)