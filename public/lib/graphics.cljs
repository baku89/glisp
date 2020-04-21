(defmacro artboard [id region & body]
  `(list
    :artboard ~id (list ~@region)
    (let
     ($width ~(nth region 2)
             $height ~(nth region 3)
             background (fn (c) (fill c (rect 0 0 $width $height))))
      (translate ~(first region) ~(nth region 1)
                 (list (guide (rect .5 .5 (- $width 1) (- $height 1))) ~@body)))))

(defn extract-artboard [name body]
  (first
   (find-list
    #(and
      (>= (count %) 4)
      (= (first %) :artboard)
      (= (nth % 1) name))
    body)))

(defn guide [body] (stroke $guide-color body))

(defn color [& e]
  (let [l (count e)]
    (cond
      (= l 1) e
      (= l 3) (str "rgba(" (nth e 0) "," (nth e 1) "," (nth e 2) ")")
      true "black")))

(defn background
  {:doc {:desc "Fill the entire view or artboard with a color"
         :params '[[c :color "A background color"]]}}
  [c] (vector :background c))

(defn enable-animation [& xs] (concat :enable-animation xs))

; ;; Transformation

(defn translate [t body] (vector :translate t body))
(defn scale [s body]
  (cond
    (number? s) (vector :scale (vector s s) body)
    (sequential? s) (vector :scale (vec s) body)))

(defn rotate [angle body] (vector :rotate angle body))

;  ;; Style

(defn fill
  {:doc {:desc "Fill the shapes with specified style"}}
  [style body]
  (vector :fill (hash-map :style style) body))

(defn stroke
  {:doc "Draw a stroke along the shapes with specified style"}
  [style width body]
  (vector :stroke (hash-map :style style :width width) body))

; (defn linear-gradient
;   {:doc "Define a linear gradient style to apply to fill or stroke"}
;   [x1 y1 x2 y2 & xs]
;   (let (args (apply hash-map xs))
;     (if (not (contains? args :stops))
;       (throw "[linear-gradient] odd number of arguments")
;       (vector :linear-gradient
;               (hash-map :points (vector x1 y1 x2 y2)
;                         :stops (get args :stops))))))

;; Shape Functions
(defn text
  {:doc {:desc "Generate a text shape"
         :params '[[str :string "the alphanumeric symbols to be displayed"]
                   [x :number "x-coordinate of text"]
                   [y :number "y-coordinate of text"]]}}
  [str x y & xs]
  (vector :text str x y (apply hash-map xs)))

(defn rect
  {:doc {:desc "Generate a rect path"
         :params '[[x :number "x-coordinate of the rectangle"]
                   [y :number "y-coordinate of the rectangle"]
                   [w :number "width of the rectangle"]
                   [h :number "height of the rectangle"]]}}
  [x y w h]
  (vector :path
          :M x y
          :L (+ x w) y
          :L (+ x w) (+ y h)
          :L x (+ y h)
          :Z))

(def K (/ (* 4 (- (sqrt 2) 1)) 3))

(defn circle
  {:doc {:desc "Generate a circle path"
         :params '[[center :vec2   "the centre of the circle"]
                   [r      :number "radius o fthe circle"]]}}
  [center r]
  (let [k (* r K)
        x (.x center)
        y (.y center)]
    (vector :path
            :M (+ x r) y			 ; right
            :C (+ x r) (+ y k) (+ x k) (+ y r) x (+ y r) ; bottom
            :C (- x k) (+ y r) (- x r) (+ y k) (- x r) y ; left
            :C (- x r) (- y k) (- x k) (- y r) x (- y r) ; top
            :C (+ x k) (- y r) (+ x r) (- y k) (+ x r)	y ; right
            :Z)))

(defn line [p1 p2]
  (vec (concat :path :M p1 :L p2)))

; (defn poly [& pts]
;   (let
;    (line-to (fn (& pts)
;               (if (< (count pts) 2)
;                 ()
;                 `(:L ~(first pts) ~(nth pts 1)
;                      ~@(apply line-to (rest (rest pts)))))))
;     (if (>= (count pts) 2)
;       `(:path
;         :M ~(first pts) ~(nth pts 1)
;         ~@(apply line-to (rest (rest pts)))
;         ~@(if (= (last pts) true) '(Z) '()))
;       [:path])))

; (defn ellipse [x y w h]
;   (->> (circle 0 0 1)
;        (path/scale w h)
;        (path/translate x y)))

; (defn point [x y]
;   (vector :path :M x y :L x y))

; (defn quad [x1 y1 x2 y2 x3 y3 x4 y4]
;   (vector :path
;           :M x1 y1
;           :L x2 y2
;           :L x3 y3
;           :L x4 y4
;           :Z))

(defn triangle [x1 y1 x2 y2 x3 y3]
  (vector :path
          :M x1 y1
          :L x2 y2
          :L x3 y3
          :Z))

(defn graph [f start end step]
  (apply poly
         (apply concat
                (map f (range start (+ end step) step)))))
