(defn artboard [id bounds & body]
  [(keyword (str "artboard#" id)) bounds
   (let
    [$width (rect/width bounds)
     $height (rect/height bounds)
     $size (rect/size bounds)
     background (fn (c) (fill c (rect [0 0] $size)))
     frame-guide (guide (rect [.5 .5] (vec2/- $size [1 1])))]
     (translate (rect/point bounds)
                (make-group [frame-guide] body)))])

(defn find-item [sel body]
  (first
   (find-list  #(= (first %) sel) body)))

(defn guide [body] (stroke $guide-color body))

(defn color [& xs]
  (case (count xs)
    1 (let [v (first xs)] (if (number? v) (format "rgba(%f,%f,%f)" v v v) v))
    3 (apply format "rgba(%f,%f,%f)" xs)
    "black"))

(defn background
  {:doc {:desc "Fill the entire view or artboard with a color"
         :params '[[c :color "A background color"]]}}
  [c]
  [:background c])

(defn enable-animation [& xs] (concat :enable-animation xs))

(defn item? [a] (and (sequential? a) (keyword? (first a))))

; ;; Transformation

(defn translate
  {:doc {:desc "Translate the containing items"
         :params '[[t :vec2 "Amount of translation"]]}}
  [t body]
  [:transform [1 0 0 1 (.x t) (.y t)] body])

(defn translate-x [x body] [:transform [1 0 0 1 x 0] body])
(defn translate-y [y body] [:transform [1 0 0 1 0 y] body])

(defn scale
  {:doc {:desc "Scale the containing items"
         :params '[[[s :vec2 "Percent to scale the items"]]
                   [[s :number "Percent to scale the items proportionally"]]]}}
  [s body]
  (cond (number? s) [:transform [s 0 0 s 0 0] body]
        (vec2? s) [:transform [(.x s) 0 0 (.y s) 0 0] body]))
(defn scale-x [sx body] [:transform [sx 0 0 1 0 0] body])
(defn scale-y [sy body] [:transform [1 0 0 sy 0 0] body])

(defn rotate [angle body]
  (let [s (sin angle)
        c (cos angle)]
    [:transform [c s (- s) c 0 0] body]))

;; Make group
(defn make-group [& xs]
  (let [children (apply concat (map #(if (item? %) [%] %) xs))]
    (if (= 1 (count children)) (first children)
        (apply vector :g children))))
(def g make-group)


;; Style
(defn fill
  {:doc {:desc "Fill the shapes with specified style"}}
  [style body]
  [:fill (hash-map :style style) body])

(defn stroke
  {:doc "Draw a stroke along the shapes with specified style"}
  [& args]
  (case (count args)
    2 (if (map? (first args))
        [:stroke (first args) (last args)]
        [:stroke (hash-map :style (first args) :width $line-width) (last args)])
    3 [:stroke (hash-map :style (first args) :width (second args)) (last args)]
    (throw "[stroke] odd number of arguments")))


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
  [str [x y] & xs]
  [:text str [x y] (apply hash-map xs)])

(defn rect
  {:doc {:desc "Generate a rect path"
         :params '[[pos :vec2 "coordinate of top-left corner of the rectangle"]
                   [size :vec2 "size of the rectangle"]]}}
  [[x y] [w h]]
  [:path
   :M x y
   :L (+ x w) y
   :L (+ x w) (+ y h)
   :L x (+ y h)
   :Z])

(def K (/ (* 4 (- (sqrt 2) 1)) 3))

(defn circle
  {:doc {:desc "Generate a circle path"
         :params '[[center :vec2   "the centre of the circle"]
                   [r      :number "radius o fthe circle"]]}}
  [[x y] r]
  (let [k (* r K)]
    [:path
     :M (+ x r) y			 ; right
     :C (+ x r) (+ y k) (+ x k) (+ y r) x (+ y r) ; bottom
     :C (- x k) (+ y r) (- x r) (+ y k) (- x r) y ; left
     :C (- x r) (- y k) (- x k) (- y r) x (- y r) ; top
     :C (+ x k) (- y r) (+ x r) (- y k) (+ x r)	y ; right
     :Z]))

(defn line [p1 p2]
  (vec (concat :path :M p1 :L p2)))

(defn polyline [& pts]
  (vec (concat :path
               :M (first pts)
               (apply concat (map #(concat :L %) (rest pts))))))

(defn polygon [& pts]
  (vec (concat :path
               :M (first pts)
               (apply concat (map #(concat :L %) (rest pts)))
               :Z)))

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