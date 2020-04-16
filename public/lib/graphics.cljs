(defmacro artboard (id region & body)
  `(list
    :artboard ~id (list ~@region)
    (let
     ($width ~(nth region 2)
             $height ~(nth region 3)
             background (fn (c) (fill c (rect 0 0 $width $height))))
      (translate ~(first region) ~(nth region 1)
                 (list (guide (rect .5 .5 (- $width 1) (- $height 1))) ~@body)))))

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
(defn enable-animation (& xs) (concat :enable-animation xs))

;; Transformation

(defn translate (x y body) `(:translate ~x ~y ~body))
(defn scale (& xs)
  (cond
    (= (count xs) 2) `(:scale ~(first xs) ~(first xs) ~(last xs))
    (= (count xs) 3) `(:scale ~@xs)))

(defn rotate (a body) `(:rotate ~a ~body))

 ;; Style

(defn fill
  {:doc {:desc "Fill the shapes with specified style"}}
  (style & xs)
  `(:fill ~(hash-map :style style) ~xs))

(defn stroke
  {:doc "Draw a stroke along the shapes with specified style"}
  (style & xs)
  (let (snd (first xs))
    (cond (list? snd) `(:stroke ~(hash-map :style style :width $line-width) ~@xs)
          (number? snd) `(:stroke ~(hash-map :style style :width snd) ~@(rest xs))
          (map? snd) `(:stroke ~(assoc snd :style style) ~(rest xs)))))

(defn linear-gradient
  {:doc "Define a linear gradient style to apply to fill or stroke"}
  (x1 y1 x2 y2 & xs)
  (let (args (apply hash-map xs))
    (if (not (contains? args :stops))
      (throw "[linear-gradient] odd number of arguments")
      (list :linear-gradient
            (hash-map :points (list x1 y1 x2 y2)
                      :stops (get args :stops))))))

;; Shape Functions
(defn path (& xs) `(:path ~@xs))

(defn text
  {:doc {:desc "Generate a text shape"
         :params '((str :string "the alphanumeric symbols to be displayed")
                   (x :number "x-coordinate of text")
                   (y :number "y-coordinate of text"))}}
  (str x y & xs)
  `(:text ~str ~x ~y ~(apply hash-map xs)))

(defn rect
  {:doc {:desc "Draws a rectangle to the screen."
         :params '((x :number "x-coordinate of the rectangle")
                   (y :number "y-coordinate of the rectangle")
                   (w :number "width of the rectangle")
                   (h :number "height of the rectangle"))}}
  (x y w h)
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
      :M ~(+ x r)  ~y			 ; right
      :C ~(+ x r) ~(+ y k) ~(+ x k) ~(+ y r) ~x ~(+ y r) ; bottom
      :C ~(- x k) ~(+ y r) ~(- x r) ~(+ y k) ~(- x r) ~y ; left
      :C ~(- x r) ~(- y k) ~(- x k) ~(- y r) ~x ~(- y r) ; top
      :C ~(+ x k) ~(- y r) ~(+ x r) ~(- y k) ~(+ x r)	~y ; right
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
