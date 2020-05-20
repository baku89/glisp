(defn set-id [id item]
  (if (element? item)
    (replace-nth item 0 (keyword (str (name (first item)) "#" id)))))

(defn get-id [item]
  (if (element? item)
    (let [fst (name (first item))
          idx (index-of fst "#")]
      (if (<= 0 idx)
        (subs fst (inc idx))
        nil))))

(defn apply-draw-handle [f & xs]
  (let [hf (-> (fn-meta f)
               (get :handles)
               (get :draw))]
    (if (fn? hf)
      (apply hf xs)
      (throw "Handle draw function does not exists"))))

(defn apply-on-drag-handle [f & xs]
  (let [hf (-> (fn-meta f)
               (get :handles)
               (get :on-drag))]
    (if (fn? hf)
      (apply hf xs)
      (throw "Handle on-drag function does not exists"))))

(defn artboard
  {:doc "Creates an artboard"
   :params [{:type "rect"}
            &
            {:type "code"}]
   :handles {:draw (fn [[bounds]]
                     (apply-draw-handle path/rect [[0 0] (rect/size bounds)]))
             :on-drag (fn [info
                           [bounds & body] ; Before evaluated
                           [_bounds & _body]] ; evaluated
                        (let
                         [_point (rect/point _bounds) ;; Evaluated point
                          _rect-args [[0 0] (rect/size _bounds)]
                          [delta-pos new-size] (apply-on-drag-handle path/rect
                                                                     info
                                                                     _rect-args _rect-args)]
                          `[[~@(vec2/+ _point delta-pos) ~@new-size] ~@body]))}}

  [bounds & body]
  [:artboard bounds
   (binding
    [*size* (rect/size bounds)
     [*width* *height*] *size*
     background (fn [c] (fill c (rect [0 0] *size*)))]
     (transform (translate (rect/point bounds))
                (guide/stroke (rect [.5 .5] (vec2/- *size* [1 1])))
                body))])

(defn tagtype [item]
  (if (zero? (count (first item)))
    nil
    (let [fst (name (first item))
          idx (index-of fst "#")]
      (if (zero? idx)
        nil
        (keyword (subs fst
                       0
                       (if (neg? idx)
                         (count fst)
                         idx)))))))


(defn find-element [sel body]
  (let [tag (tagtype [sel])
        id (get-id [sel])
        pred (cond
               (and tag id) #(= (first %))
               tag          #(= (tagtype %) tag)
               id           #(= (get-id %) id)
               :else        (fn [] true))]
    ;; Search
    (first (find-elements pred body))))


(def get-element-bounds

  (let [get-abs-path
        (fn [body]
          (if (vector? body)
            (if (keyword? (first body))
              (let [tag (tagtype body)]
                (cond

          ;; Path
                  (= tag :path)
                  body

          ;; Transform
                  (= tag :transform)
                  (path/transform (second body)
                                  (get-abs-path `[~@(slice body 2)]))

          ;; Artboard
                  (= tag :artboard)
                  (let [bounds (second body)]
                    (rect (rect/point bounds) (rect/size bounds)))

          ;; Style (offset stroke)
          ;; NOTE: Path-offset looks buggy
          ;; (and (starts-with? tagname "style")
          ;;      (get (second body) :stroke))
          ;; (prn-pass (path/offset-stroke 10 (get-abs-path `[~@(slice body 2)])))

                  :else
                  (get-abs-path `[~@(slice body 2)])))
    ;; Just a vector
              (->> body
                   (map get-abs-path)
                   (remove nil?)
                   (apply path/merge)))))]

    (fn [body] (path/bounds (get-abs-path body)))))


(defn guide/stroke [& xs]
  (style (stroke *guide-color*)
         xs))

(defmacro g
  [attrs & xs]
  (let [_attrs (gensym)
        _attr-transform (gensym)
        _attr-style (gensym)]
    `(let [~_attrs ~attrs
           ~_attr-transform (get ~_attrs :transform)
           ~_attr-style (get ~_attrs :style)]

       (cond
         (and ~_attr-transform ~_attr-style)
         ~`(transform ~_attr-transform ~`(style ~_attr-style ~@xs))

         ~_attr-transform
         ~`(transform ~_attr-transform ~@xs)

         ~_attr-style
         ~`(style ~_attr-style ~@xs)

         :else
         (vec ~xs)))))

(defn style
  [attrs & xs]
  `[:style ~attrs ~@xs])


;; Color
(defn color
  {:doc "Creates a color string"}
  [& xs]
  (case (count xs)
    1 (let [v (first xs)]
        (if (number? v)
          (color/gray v)
          v))
    3 (apply color/rgb xs)
    "black"))

(defn color? [x]
  (string? x))

(defn color/gray
  {:returns {:type "color"}}
  [v]
  (def b (* v 255))
  (format "rgb(%f,%f,%f)" b b b))

(defn color/rgb
  {:params [{:label "Red" :type "number"}
            {:label "Green" :type "number"}
            {:label "Blue" :type "number"}]
   :returns {:type "color"}}
  [r g b]
  (format "rgb(%f,%f,%f)" (* r 255) (* g 255) (* b 255)))

(defn color/hsl
  {:params [{:label "Hue" :type "number"}
            {:label "Saturation" :type "number"}
            {:label "Lightness" :type "number"}]
   :returns {:type "color"}}
  [h s l]
  (format "rgb(%f,%f,%f)" (* (mod h 1) 360) (* s 100) (* l 100)))

(defmacro background
  [color]
  `(do
     (def *background* ~color)
     (vector :background ~color)))

(def background
  (with-meta background
    {:doc "Fill the entire view or artboard with a color"
     :params [{:type "color" :desc "A background color"}]}))

(defn enable-animation
  [& xs] (concat :enable-animation xs))

(defn element? [a] (and (sequential? a) (keyword? (first a))))

(defn column
  {:doc "Returns a vector of nums from *start* to *end* (both inclusive) that each of element is multiplied by *step*"
   :params [{:type "number" :desc "From"}
            {:type "number" :desc "To"}
            {:type "number" :desc "Step"}]}
  [from to step]
  (vec (map #(* % step) (range from (inc to)))))

;; Transform
(defn  view-center
  {:doc "Returns a translation matrix to move the origin onto the center of view or artboard"
   :returns {:type "mat2d"}
   :handles {:draw (fn [_ mat]
                     [{:type "point" :class "translate" :pos (take 4 mat)}])}}
  []
  (translate (vec2/scale *size* .5)))

;; Style
(defn fill
  {:doc "Creates a fill property"
   :params [{:label "Color" :type "color" :desc "Color to fill"}]}
  [color]
  {:fill true :fill-color color})

(defn stroke
  {:doc "Creates a stroke property"
   :params [{:label "Color" :type "color"}
            {:label "Width" :default 1 :type "number" :constraints {:min 0}}
            &
            {:keys [{:key :cap :type "string" :default "round"
                     :enum ["butt" "round" "square"]}
                    {:key :join :type "string" :default "round"
                     :enum ["bevel" "round" "miter"]}]}]}
  [color & args]
  (let [params (case (count args)
                 0 {}
                 1 {:width (first args)}
                 (apply hash-map (concat :width args)))]
    (->> params
         (seq params)
         (map (fn [[k v]] [(keyword (str "stroke-" (name k))) v]))
         (apply concat [:stroke true :stroke-color color])
         (apply hash-map))))

; (defn linear-gradient
;   {:doc "Define a linear gradient style to apply to fill or stroke"}
;   [x1 y1 x2 y2 & xs]
;   (let [args (apply hash-map xs)]
;     (if (not (contains? args :stops))
;       (throw "[linear-gradient] odd number of arguments")
;       (vector :linear-gradient
;               (hash-map :points (vector x1 y1 x2 y2)
;                         :stops (get args :stops))))))

;; Shape Functions
(defn text
  {:doc "Generate a text shape"
   :params [{:type "string" :desc "the alphanumeric symbols to be displayed"}
            {:type "vec2"}
            &
            {:keys [{:key :size :type "number" :default 12}
                    {:key :font :type "string" :default "Fira Code"}
                    {:key :align :type "string" :default "center"
                     :enum ["left" "center" "right" "start" "end"]}
                    {:key :baseline :type "string" :default "middle"
                     :enum ["top" "hanging" "middle"
                            "alphabetic" "ideographic" "bottom"]}]}]
   :handles {:draw (fn [[_ pos & xs]]
                     (let [args (apply hash-map xs)
                           size (get args :size 12)]
                       [{:id :pos
                         :type "point"
                         :class "translate"
                         :pos pos}
                        {:id :size
                         :type "path"
                         :path (ngon pos size 4)}]))
             :on-drag (fn [{:id id :pos p} params]
                        (case id
                          :pos (replace-nth params 1 p)
                          :size (let [text-pos (take 2 params)
                                      dir (vec2/- (nth params 1) p)
                                      size (+ (abs (.x dir)) (abs (.y dir)))
                                      args (->> (take 2 params)
                                                (apply hash-map)
                                                (#(assoc % :size size))
                                                (entries)
                                                (apply concat))]
                                  (concat text-pos args))))}}
  [text pos & xs]
  [:text text pos (apply hash-map xs)])
