;; Graphics and UI
(def $canvas "")
(def $width 1000)
(def $height 1000)
(def $background nil)
(def $guide-color nil)


(defn filter-sketch (coll)
  (if (not (list? coll))
    nil
    (cond
      (keyword? (first coll)) coll
      (list? (first coll))
      (->> coll
           (map filter-sketch)
           (remove empty?)))))

(defn filter-root-sketch (coll)
  (->> coll
       (map filter-sketch)
       (remove empty?)))

(defn eval-sketch (& xs)
  (filter-root-sketch
   (slice xs (inc (last-index-of :start-sketch xs)) (count xs))))

(defmacro artboard (id region & body)
  `(list
    :artboard ~id (list ~@region)
    (let
     ($width ~(nth region 2)
             $height ~(nth region 3)
             background (fn (c) (fill c (rect 0 0 $width $height))))
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

(defn guide (body) (stroke $guide-color body))

(defn color (& e)
  (let (l (count e))
    (cond
      (= l 1) e
      (= l 3) (str "rgba(" (nth e 0) "," (nth e 1) "," (nth e 2) ")")
      true "black")))

(defn background (c) `(:background ~c))

;; Transformation

(defn translate (x y body) `(:translate ~x ~y ~body))
(defn scale (& xs)
  (cond
    (= (count xs) 2) `(:scale ~(first xs) ~(first xs) ~(last xs))
    (= (count xs) 3) `(:scale ~@xs)))

(defn rotate (a body) `(:rotate ~a ~body))


 ;; Style

(defn fill (& xs)
  (let (l (count xs))
    (if (= l 2) `(:fill ~@xs))))

(defn stroke (& xs)
  (let (l (count xs))
    (cond
      (= l 2) `(:stroke ~(first xs) 1 ~(last xs))
      (= l 3) `(:stroke ~@xs)
      :else nil)))

;; Shape Functions

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
                `(:L ~(first pts) ~(nth pts 1)
                     ~@(apply line-to (rest (rest pts)))))))
    (if (>= (count pts) 2)
      `(:path
        :M ~(first pts) ~(nth pts 1)
        ~@(apply line-to (rest (rest pts)))
        ~@(if (= (last pts) true) '(Z) '()))
      `(:path))))

(defn ellipse (x y w h)
  (->> (circle 0 0 1)
       (path/scale w h)
       (path/translate x y)))

(defn point (x y)
  `(:path :M ~x ~y :L ~x ~y))

(defn quad (x1 y1 x2 y2 x3 y3 x4 y4)
  `(:path
    :M ~x1 ~y1
    :L ~x2 ~y2
    :L ~x3 ~y3
    :L ~x4 ~y4
    :Z))

(defn triangle (x1 y1 x2 y2 x3 y3)
  `(:path
    :M ~x1 ~y1
    :L ~x2 ~y2
    :L ~x3 ~y3
    :Z))

(defn graph (f start end step)
  (apply poly
         (apply concat
                (map f (range start (+ end step) step)))))
