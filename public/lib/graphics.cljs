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

; ;; Transformation

(defn translate
  {:doc {:desc "Translate the containing items"
         :params '[[[x y] :vec2 "Amount of translation"]]
         :return '[:mat2d "Transform matrix"]}}
  [[x y]]
  [1 0 0 1 x y])

(defn translate-x [x] [1 0 0 1 x 0])
(defn translate-y [y] [1 0 0 1 0 y])

(defn scale
  {:doc {:desc "Scale the containing items"
         :params '[[[s :vec2 "Percent to scale the items"]]
                   [[s :number "Percent to scale the items proportionally"]]]}}
  [s]
  (cond (number? s) [s 0 0 s 0 0]
        (vec2? s) [(.x s) 0 0 (.y s) 0 0]))

(defn scale-x [sx] [sx 0 0 1 0 0])
(defn scale-y [sy] [1 0 0 sy 0 0])

(defn rotate [angle]
  (let [s (sin angle)
        c (cos angle)]
    [c s (- s) c 0 0]))

;; Group
(defn g [& xs]
  (let [children (apply concat (map #(if (item? %) [%] %) xs))]
    (if (= 1 (count children)) (first children)
        (apply vector :g children))))

;; Style
(defn fill [color]
  {:fill true :fill-color color})

(defn stroke [fst & args]
  (cond (map? fst) (->> (seq fst)
                        (map (fn [[k v]] (list (keyword (str "stroke-" (name k))) v)))
                        (apply concat)
                        (apply hash-map))))

(defn g/fill
  {:doc {:desc "Fill the shapes with specified style"}}
  [color & body]
  (vec `(:g ~{:style {:fill true :fill-color color}} ~@body)))

(defn g/stroke
  {:doc "Draw a stroke along the shapes with specified style"}
  [fst snd & args]
  (cond (map? fst) (let [attrs (->> (seq fst)
                                    (map (fn [[k v]] (list (keyword (str "stroke-" (name k))) v)))
                                    (apply concat)
                                    (apply hash-map))]
                     (vec `(:g ~(hash-map :style (assoc attrs :stroke true)) ~@(concat [snd] args))))
        (string? fst) (if (number? snd)
                        (vec `(:g ~(hash-map :style {:stroke true
                                                     :stroke-color fst
                                                     :stroke-width snd})
                                  ~@args))
                        (vec `(:g ~(hash-map :style {:stroke true
                                                     :stroke-color fst
                                                     :stroke-width 1})
                                  ~(concat [snd] args))))))


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
