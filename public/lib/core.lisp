(defmacro defn (name params & body)
	`(def
		~name
		(fn
			~params
			~(if (= 1 (count body))
				(first body)
				`(do ~@body)))))

(defmacro macroview (expr)
	`(prn (macroexpand ~expr)))


(defn eval-sketch (& xs)
	(slice xs (inc (last-index-of :start-sketch xs)) (count xs)))
		

;; Conditionals
(defmacro cond (& xs)
	(if (> (count xs) 0)
		(list
			'if
			(first xs)
			(if (> (count xs) 1) (nth xs 1) (throw "[cond] Odd number of forms to cond"))
			(cons 'cond (rest (rest xs))))))

(defmacro or (& xs)
	(if (empty? xs)
		false
		`(if ~(first xs) ~(first xs) (or ~@(rest xs)))))

(defmacro and (& xs)
	(if (= (count xs) 1)
		(first xs)
		`(if ~(first xs) (and ~@(rest xs)) false)))

;; Functioal Language Features
(defn reduce (f init xs)
  (if (empty? xs) init (reduce f (f init (first xs)) (rest xs))))

(defn foldr (f init xs)
  (if (empty? xs)
		init
		(f
			(first xs)
			(foldr f init (rest xs)))))

(defn map (f xs)
	(foldr (fn (x acc) (cons (f x) acc)) () xs))

(defn cartesian-product (& xs)
	(apply concat 
		(map
			(fn (R) (map #(cons % R) (first xs)))
			(if (= 2 (count xs))
				(last xs)
				(apply product (rest xs))))))

(defn map-indexed (f xs)
	(map
		(fn (i) (f i (nth xs i)))
		(range (count xs))))

(defn filter (f xs)
	(reduce
		(fn (l x)
			(if (f x)
				(push l x)
				l))
		'()
		xs))

(defn remove (f xs)
	(reduce
		(fn (l x)
			(if (not (f x))
				(push l x)
				l))
		'()
		xs))
		
(defmacro ->> (values & forms)
	(reduce
		(fn (v form) `(~@form ~v))
		values
		forms))

(defn find-list (f lst)
	(do
		(if (list? lst)
			(if (f lst)
				(apply concat `(~(list lst) ~@(map #(find-list f %) lst)))
				(apply concat (map #(find-list f %) lst)))
			'())))
			
;; Math
(def TWO_PI (* PI 2))
(def HALF_PI (/ PI 2))

(defn lerp (a b t) (+ b (* (- a b) t)))
(defn deg (x) (/ (* x 180) PI))
(defn rad (x) (/ (* x PI) 180))
(defn distance (x1 y1 x2 y2)
	(sqrt (+ (pow (- x2 x1) 2) (pow (- y2 y1) 2))))

(defn odd? (x) (= (mod x 2) 1))
(defn even? (x) (= (mod x 2) 0))

;; Logical
(defn not (a) (if a false true))

;; Trivial
(def g list)

(defn inc (x) (+ x 1))
(defn dec (x) (- a 1))

(defn empty? (x) (= (count x) 0))

(defn second (x) (first (rest x)))


(def gensym
	(let (counter (atom 0))
		#(symbol (str "G__" (swap! counter inc)))))

;; UI
(def $ui-background nil)
(def $ui-border nil)

;; Graphical
(def $canvas "")

(defn color (& e)
	(let (l (count e))
		(cond
			(= l 1) e
			(= l 3) (str "rgba(" (nth e 0) "," (nth e 1) "," (nth e 2) ")")
			true "black")))

(defn translate (x y body) `(:translate ~x ~y ~body))
(defn scale (& xs) 
	(cond
		(= (count xs) 2) `(:scale ~(first xs) ~(first xs) ~(last xs))
		(= (count xs) 3) `(:scale ~@xs)))

(defn rotate (a body) `(:rotate ~a ~body))

(defn background (& xs) `(:background ~@xs))

(defn fill (& xs) 
	(let (l (count xs))
		(if (= l 2) `(:fill ~@xs))))

(defn stroke (& xs)
	(let (l (count xs))
		(cond
			(= l 2) `(:stroke ~(first xs) 1 ~(last xs))
			(= l 3) `(:stroke ~@xs)
			:else nil)))


(defn path/map-points (f path)
	(cons
		:path
		(apply concat 
			(map
				(fn (xs)
					(let (cmd (first xs) points (rest xs))
						`(~cmd ~@(apply concat
							(map f (partition 2 points))))
					)
				)
				(path/split-segments path)))))

(defn path/translate (x y path)
	(let
		(f (fn (pos)
			`(~(+ (first pos) x) ~(+ (last pos) y))))
		(path/map-points f path)))

(defn path/scale (x y path)
	(let
		(f (fn (pos)
			`(~(* (first pos) x) ~(* (last pos) y))))
		(path/map-points f path)))

(defn path/rotate (x y angle path)
	(let (origin (list x y))
		(path/map-points #(point/rotate origin angle %) path)))

(defn path/merge (& xs)
	`(path ~@(apply concat (map rest xs))))

(defn path (& xs) `(:path ~@xs))

(defn text (& xs) `(:text ~@xs))

(defn rect (x y w h)
	`(:path
		:M ~x ~y
		:L ~(+ x w) ~y
		:L ~(+ x w) ~(+ y h)
		:L ~x ~(+ y h)
		:Z))

(def K (/ (* 4 (- (sqrt 2) 1)) 3))

(defn circle (x y r)
	(let (k (* r K))
		`(:path
			:M	~(+ x r)  ~y			 ; right
			:C	~(+ x r)	~(+ y k)
					~(+ x k)	~(+ y r)
					~x				~(+ y r) ; bottom
			:C	~(- x k)	~(+ y r) 
					~(- x r)	~(+ y k)
					~(- x r)	~y			 ; left
			:C	~(- x r)	~(- y k) 
					~(- x k)	~(- y r)
					~x				~(- y r) ; top
			:C	~(+ x k)	~(- y r) 
					~(+ x r)	~(- y k)
					~(+ x r)	~y			 ; right
			:Z)))
	
(defn line (x1 y1 x2 y2)
	`(:path :M ~x1 ~y1 :L ~x2 ~y2))

(defn poly (& pts)
	(let
		(line-to (fn (& pts)
			(if (< (count pts) 2)
				()
				`(
					:L ~(first pts) ~(nth pts 1)
					~@(apply line-to (rest (rest pts)))))))
		(if (>= (count pts) 2)
			`(:path
				:M ~(first pts) ~(nth pts 1)
				~@(apply line-to (rest (rest pts)))
				~@(if (= (last pts) true) '(Z) '()))
			`(:path))))

(defn graph (start end step f)
	(apply poly
		(apply concat
			(map f (range start (+ end step) step)))))

(defmacro artboard (id region & body)
	`(list
		:artboard ~id (list ~@region)
		(let
			(
				$width ~(nth region 2)
				$height ~(nth region 3)
				background (fn (c) (fill c (rect 0 0 $width $height)))
			)
			(translate ~(first region) ~(nth region 1)
				(list 'g (guide (rect .5 .5 (- $width 1) (- $height 1))) ~@body)))))

(defn extract-artboard (name body)
	(first
		(find-list
			#(and
				(>= (count %) 4)
				(= (first %) :artboard)
				(= (nth % 1) name))
			body)))

(defn guide (body) (stroke $ui-border body))

;; Draw
(defmacro begin-draw (state)
	`(def ~state nil))

(defmacro draw (f state input)
	`(do
		(def __ret__ (~f ~state ~input))
		(def ~state (if (first __ret__) __ret__ (concat (list (first ~state)) (rest __ret__))))
		(first __ret__)))

(def $pens ())
(def $hands ())

(defmacro defpen (name params body)
	`(do
		(def ~name (fn ~params ~body))
		(def $pens (push $pens '~name))))

(defmacro defhand (name params body)
	`(do
		(def ~name (fn ~params ~body))
		(def $hands (push $hands '~name))))


;; Linear-algebra

(defn get-x (p) (first p))
(defn get-y (p) (second p))

(defn point/+ (a b)
	(list (+ (get-x a) (get-x b))
				(+ (get-y a) (get-y b))))

(defn point/+ (a b)
	(list (- (get-x a) (get-x b))
				(- (get-y a) (get-y b))))

(defn point/scale (p s)
	(list (* s (get-x p))
				(* s (get-y p))))

(defn point/rotate (origin angle p)
	(let (ox		(get-x origin)
				oy		(get-y origin)
				x			(- (get-x p) ox)
				y			(- (get-y p) oy)
				sinC	(sin angle)
				cosC	(cos angle))
		(list (+ ox (- (* x cosC) (* y sinC)))
					(+ ox (+ (* x sinC) (* y cosC))))))