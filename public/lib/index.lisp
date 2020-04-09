(defmacro! defn! (fn (name params body)
	`(def! ~name (fn ~params ~body))))

(defmacro! macroview (fn (expr)
	`(prn (macroexpand ~expr))
))

;; Conditionals
(defmacro! cond (fn (& xs)
	(if (> (count xs) 0)
		(list
			'if
			(first xs)
			(if (> (count xs) 1) (nth xs 1) (throw "odd number of forms to cond"))
			(cons 'cond (rest (rest xs)))
		)
	)
))

;; Functioal Language Features
(defn! reduce (f init xs)
  (if (empty? xs) init (reduce f (f init (first xs)) (rest xs))))

(defn! foldr (f init xs)
  (if (empty? xs)
		init
		(f
			(first xs)
			(foldr f init (rest xs))
		)
	)
)

(defn! map (f xs)
	(foldr (fn (x acc) (cons (f x) acc)) () xs))

;; Math
(def! PI2 (* PI 2))
(defn! lerp (a b t) (+ b (* (- a b) t)))
(defn! degrees (radians) (/ (* radians 180) PI))
(defn! radians (degrees) (/ (* degrees PI) 180))
(defn! distance (x1 y1 x2 y2)
	(sqrt (+ (pow (- x2 x1) 2) (pow (- y2 y1) 2))))

;; Logical
(defn! not (a) (if a false true))

;; Trivial
(defn! inc (x) (+ x 1))
(defn! dec (x) (- a 1))

(def! gensym (let (counter (atom 0)) (fn () (symbol (str "G__" (swap! counter inc))))))

;; Graphical
(def! $ "")
(defmacro! set$ (fn (x) `(def! $ ~x)))

(defn! color (& e)
	(let (l (count e))
		(cond
			(= l 1) e
			(= l 3) (str "rgba(" (nth e 0) "," (nth e 1) "," (nth e 2) ")")
			true "black"
		)
	)
)

(defn! translate (x y body) `(translate ~x ~y ~body))
(defn! scale (x y body) `(scale ~x ~y ~body))
(defn! rotate (a body) `(rotate ~a ~body))

(defn! background (& xs) `(background ~@xs))

(defn! fill (& xs) 
	(let (l (count xs))
		(cond
			(= l 2) `(fill ~@xs)
			true nil
		)
	)
)

(defn! stroke (& xs)
	(let (l (count xs))
		(cond
			(= l 2) `(stroke ~(first xs) 1 ~(last xs))
			(= l 3) `(stroke ~@xs)
			true nil
		)
	)
)

(defn! merge-path (& xs)
	`(path ~@(apply concat (map rest xs))))

(defn! rect (x y w h)
	`(path
		M ~x ~y
		L ~(+ x w) ~y
		L ~(+ x w) ~(+ y h)
		L ~x ~(+ y h)
		Z))

(defn! circle (x y r)
	`(path M ~(+ x r) ~y A ~x ~y ~r 0 ~PI2 false Z))
	
(defn! line (x1 y1 x2 y2)
	`(path M ~x1 ~y1 L ~x2 ~y2))

(defn! _polyline (& pts)
	(if (< (count pts) 2)
		()
		`(
			L ~(first pts) ~(nth pts 1)
			~@(apply _polyline (rest (rest pts)))
		)
	)
)

(defn! polyline (& pts)
	(if (>= (count pts) 2)
		`(
			path
			~@(concat
				M (first pts) (nth pts 1)
				(apply _polyline (rest (rest pts))))
		)
	)
)

;; Draw
(defmacro! begin-draw! (fn (state)
	`(def! ~state nil)
))

(defmacro! draw! (fn (f state input)
	`(do
		(def! __res__ (~f ~state ~input))
		(def! ~state (rest __res__))
		(first __res__)
	)
))

