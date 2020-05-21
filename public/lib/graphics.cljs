(defn set-id [id elm]
  (if (element? elm)
    (replace-nth elm 0 (keyword (str (name (first elm)) "#" id)))))

(defn get-id [elm]
  (if (element? elm)
    (let [fst (name (first elm))
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
   :params [{:label "Options" :type "code"}
            &
            {:label "Body" :type "code"}]
   :handles {:draw
             (fn [[{:bounds bounds}]] ; [{:bounds bounds}]
               (apply-draw-handle rect/init [`[0 0 ~@(rect/size bounds)]]))
             :on-drag
             (fn [info
                  [option & body] ; Before evaluated
                  [{:bounds _bounds}]] ; evaluated
               (let
                [_point (rect/point _bounds) ;; Evaluated point
                 _rect-args [`[0 0 ~@(rect/size _bounds)]]
                 ret-bounds (apply-on-drag-handle
                             rect/init
                             info
                             _rect-args _rect-args)
                 delta-pos (rect/point ret-bounds)
                 new-size (rect/size ret-bounds)
                 new-bounds `[~@(vec2/+ _point delta-pos) ~@new-size]
                 new-option {:bounds new-bounds}
                 new-option (if (contains? option :background)
                              (assoc new-option
                                     :background
                                     (get option :background))
                              new-option)]
                 `[~new-option ~@body]))}}

  [options & xs]
  nil)

(defn tagtype [item]
  (if (zero? (count (name (first item))))
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

(defn gen-element-selector-pred [sel]
  (let [dummy-tag [(keyword (name sel))]
        tag (tagtype dummy-tag)
        id (get-id dummy-tag)]
    (cond
      (and tag id) (fn [elm] (= (first elm)))
      tag          (fn [elm] (= (tagtype elm) tag))
      id           (fn [elm] (= (get-id elm) id))
      :else        (fn [] true))))

(defn find-element [sel body]
  (first (match-elements (gen-element-selector-pred sel) body)))

(defn filter-elements [sel body]
  (let [pred (gen-element-selector-pred sel)]
    (if (sequential? body)
      (if (element? body)
        (if (<= 0 (index-of [:path :text :background] (tagtype body)))
          ;; self-closing tags
          (if (pred body) body nil)

          ;; other tags such as :g
          (if (pred body)
            ;; Returns all of body
            body

            ;; Filter children
            (let [children (slice body 2)
                  filtered-chilren (filter-elements sel children)]
              (if (nil? filtered-chilren)
                ;; None of children matches
                nil
                ;; 
                `[~@(slice body 0 2)
                  ~@filtered-chilren]))))

        ;; Not element yet still sequence
        (let [filtered-chilren
              (remove nil? (map #(filter-elements sel %) body))]
          (if (zero? (count filtered-chilren))
            nil
            filtered-chilren)))

      ;; Not a list
      nil)))

(def get-element-bounds

  (let [get-merged-path
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
                                  (get-merged-path `[~@(slice body 2)]))

                  ;; Artboard
                  (= tag :artboard)
                  (let [bounds (second body)]
                    (rect (rect/point bounds) (rect/size bounds)))

                  ;; Style (offset stroke)
                  ;; NOTE: Path-offset looks buggy
                  ;; (and (starts-with? tagname "style")
                  ;;      (get (second body) :stroke))
                  ;; (prn-pass (path/offset-stroke 10 (get-merged-path `[~@(slice body 2)])))

                  :else
                  (get-merged-path `[~@(slice body 2)])))

              ;; Just a vector
              (->> body
                   (map get-merged-path)
                   (remove nil?)
                   (apply path/merge)))))]

    (fn [body] (path/bounds (get-merged-path body)))))



(def guide/axis
  (let [arrow (fn [from to color]
                (style (stroke color 2)
                       (def l (line from to))
                       (transform (path/align-at 1 l)
                                  (polyline [-5 -4] [0 0] [-5 4]))))]
    (fn [& xs]
      (let [[center size] (case (count xs)
                            0 [[0 0] 40]
                            1 [(first xs) 40]
                            xs)]
        (transform
         (translate center)

         (arrow [0 0] [size 0] "tomato")
         (arrow [0 0] [0 size] "limegreen")

         (guide/dotted-stroke (polyline [size 0] [size size] [0 size])))))))


(defn guide/stroke [& xs]
  (style (stroke *guide-color*)
         xs))

(defn guide/dotted-stroke [& xs]
  (style (stroke *guide-color* 1 :dash [2 2])
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

(defn background
  [color]
  `[:background ~color ~*inside-artboard*])

(def background
  (with-meta background
    {:doc "Fill the entire view or artboard with a color"
     :params [{:type "color" :desc "A background color"}]}))

(defn enable-animation
  [& xs] (concat :enable-animation xs))

(defn element? [a] (and (vector? a) (keyword? (first a))))

(defn column
  {:doc "Returns a vector of nums from *start* to *end* (both inclusive) that each of element is multiplied by *step*"
   :params [{:type "number" :desc "From"}
            {:type "number" :desc "To"}
            {:type "number" :desc "Step"}]}
  [from to step]
  (vec (map #(* % step) (range from (inc to)))))

;; Transform
(defn  view-center
  {:doc "Returns the center of view or artboard"
   :returns {:type "vec2"}
   :handles {:draw (fn [_ mat]
                     [{:type "point" :class "translate" :pos (take 4 mat)}])}}
  []
  (vec2/scale *size* .5))

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
