(defn artboard [id bounds & body]
  [(keyword (str "artboard#" id)) bounds
   (let
    [$width (rect/width bounds)
     $height (rect/height bounds)
     $size (rect/size bounds)
     background (fn (c) (fill c (rect [0 0] $size)))
     frame-guide (guide (rect [.5 .5] (vec2/- $size [1 1])))]
     (translate (rect/point bounds)
                (g [frame-guide] body)))])

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

(defn column [from to step]
  (map #(* % step) (range from to)))

; ;; Transformation
(defn translate
  {:doc {:desc "Translate the containing items"
         :params '[[[x y] :vec2 "Amount of translation"]]
         :return '[:mat2d "Transform matrix"]}}
  [[x y]]
  [1 0 0 1 x y])

;; Group
(defn g [& xs]
  (let [children (apply concat (map #(if (item? %) [%] %) xs))]
    (if (= 1 (count children)) (first children)
        (apply vector :g children))))

(defmacro g/for [& xs] `(g (for ~@xs)))

(defn g/fill
  {:doc {:desc "Fill the shapes with specified style"}}
  [color & body]
  (vec `(:g ~{:style (fill color)} ~@body)))

(defn g/stroke
  {:doc "Draw a stroke along the shapes with specified style"}
  [fst snd & args]
  (let [body (if (number? snd) args (concat [snd] args))]
    (vec `(:g ~(hash-map :style (stroke fst snd)) ~@body))))

;; Transform
(defmacro view-center []
  `(translate (vec2/scale $size .5)))

;; Style
(defn fill [color]
  {:fill true :fill-color color})

(defn stroke [fst & args]
  (cond (map? fst) (->> (seq fst)
                        (map (fn [[k v]] (list (keyword (str "stroke-" (name k))) v)))
                        (apply concat [:stroke true])
                        (apply hash-map))
        (string? fst) (let [snd (first args)]
                        (if (number? snd)
                          {:stroke true :stroke-color fst :stroke-width snd}
                          {:stroke true :stroke-color fst}))))

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
; (defn text
;   {:doc {:desc "Generate a text shape"
;          :params '[[str :string "the alphanumeric symbols to be displayed"]
;                    [x :number "x-coordinate of text"]
;                    [y :number "y-coordinate of text"]]}}
;   [str [x y] & xs]
;   [:text str [x y] (apply hash-map xs)])
