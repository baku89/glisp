(defmacro artboard [id region & body]
  [:artboard id region
   (let
    [$width (nth region 2)
     $height (nth region 3)
     $size [$width $height]
     background (fn (c) (fill c (rect [0 0] $size)))]
     (translate (vec2 region)
                (apply vector
                       [(guide (rect [.5 .5] (vec2/- $size 1)))] body)))])

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

(defn translate
  {:doc {:desc "Translate the containing items"
         :params '[[t :vec2 "Amount of translation"]]}}
  [t body] (vector :transform [1 0 0 1 (.x t) (.y t)] body))
(defn translate-x [x body] (vector :transform [1 0 0 1 x 0] body))
(defn translate-y [y body] (vector :transform [1 0 0 1 0 y] body))

(defn scale
  {:doc {:desc "Scale the containing items"
         :params '[[[s :vec2 "Percent to scale the items"]]
                   [[s :number "Percent to scale the items proportionally"]]]}}
  [s body]
  (cond
    (number? s) (vector :transform [s 0 0 s 0 0] body)
    (vec2? s) (vector :transform [(.x s) 0 0 (.y s) 0 0] body)))
(defn scale-x [sx body] (vector :transform [sx 0 0 1 0 0] body))
(defn scale-y [sy body] (vector :transform [1 0 0 sy 0 0] body))

(defn rotate [angle body]
  (let [s (sin angle)
        c (cos angle)]
    (vector :transform [c s (- s) c 0 0] body)))

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
         :params '[[pos :vec2 "coordinate of top-left corner of the rectangle"]
                   [size :vec2 "size of the rectangle"]]}}
  [pos size]
  (let [x (.x pos)
        y (.y pos)
        w (.x size)
        h (.y size)]
    (vector :path
            :M x y
            :L (+ x w) y
            :L (+ x w) (+ y h)
            :L x (+ y h)
            :Z)))

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

(defn poly [& pts]
  (vec (concat
        :path
        :M (first pts)
        (apply concat (map #(concat :L %)
                           (rest pts))))))

(defn ellipse [center size]
  (->> (circle (vec2) 1)
       (path/scale size)
       (path/translate center)))

(defn point [p]
  (vec (concat :path :M p :L p)))

(defn quad [p1 p2 p3 p4]
  (vec (concat :path
               :M p1
               :L p2
               :L p3
               :L p4
               :Z)))

(defn triangle [p1 p2 p3]
  (vec (concat :path
               :M p1
               :L p2
               :L p3
               :Z)))

(defn graph [f start end step]
  (apply poly
         (apply concat
                (map f (range start (+ end step) step)))))
