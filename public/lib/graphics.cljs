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

(defn apply-drag-handle [f & xs]
  (let [hf (-> (fn-meta f)
               (get :handles)
               (get :drag))]
    (if (fn? hf)
      (apply hf xs)
      (throw "Handle on-drag function does not exists"))))

(defn artboard
  {:doc "Creates an artboard"
   :params [{:label "Options" :type "code"}
            &
            {:label "Body" :type "code"}]
  ;; Looks Buggy
  ;;  :handles {:draw
  ;;            (fn [info]
  ;;              (let [{:params {:bounds bounds}} info
  ;;                    _ (prn info)
  ;;                    _params [`[0 0 ~@(rect2d/size bounds)]]
  ;;                    _info (assoc info
  ;;                                 :params _params
  ;;                                 :unevaluated-params _params)]

  ;;                (apply-draw-handle rect2d/init _info)))
  ;;            :drag
  ;;            (fn [info
  ;;                 [option & body] ; Before evaluated
  ;;                 [{:bounds _bounds}]] ; evaluated
  ;;              (let
  ;;               [_point (rect2d/point _bounds) ;; Evaluated point
  ;;                _rect-args [`[0 0 ~@(rect2d/size _bounds)]]
  ;;                ret-bounds (apply-drag-handle
  ;;                            rect2d/init
  ;;                            (assoc info
  ;;                                   :params _rect-args
  ;;                                   :unevaluated-params _rect-args))
  ;;                delta-pos (rect2d/point ret-bounds)
  ;;                new-size (rect2d/size ret-bounds)
  ;;                new-bounds `[~@(vec2/+ _point delta-pos) ~@new-size]
  ;;                new-option {:bounds new-bounds}
  ;;                new-option (if (contains? option :background)
  ;;                             (assoc new-option
  ;;                                    :background
  ;;                                    (get option :background))
  ;;                             new-option)]
  ;;                `[~new-option ~@body]))}}
   }
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
                    (rect (rect2d/point bounds) (rect2d/size bounds)))

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

(defn graphics/background
  {:doc "Fill the entire view or artboard with a color"
   :params [{:type "color" :desc "A background color"}]}
  [color]
  `[:background ~color ~*inside-artboard*])
(defalias background graphics/background)

(defn enable-animation
  [& xs] (concat :enable-animation xs))

(defn element? [a] (and (vector? a) (keyword? (first a))))

;; Transform
(defn view-center
  {:doc "Returns the center of view or artboard"
   :returns {:type "vec2"}
   :handles {:draw (fn [{:return mat}]
                     [{:type "point" :class "translate" :pos (take 4 mat)}])}}
  []
  (vec2/scale *size* .5))

;; Style
(defn graphics/fill
  {:doc "Creates a fill property"
   :params [{:label "Color" :type "color" :desc "Color to fill"}]}
  [& xs]
  (if (zero? (count xs))
    {:fill true}
    {:fill true :fill-color (first xs)}))
(defalias fill graphics/fill)

(defn graphics/no-fill
  {:doc "Disables all the previous fill styles"
   :params []}
  [] {:fill false})
(defalias no-fill graphics/no-fill)

(defn graphics/stroke
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
(defalias stroke graphics/stroke)

(defn graphics/no-stroke
  {:doc "Disables all the previous stroke styles"
   :params []}
  [] {:stroke false})
(defalias no-stroke graphics/no-stroke)

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
(defn graphics/text
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
   :handles {:draw (fn [{:params [_ pos & xs]}]
                     (let [args (apply hash-map xs)
                           size (get args :size 12)]
                       [{:id :pos
                         :type "point"
                         :class "translate"
                         :pos pos}
                        {:id :size
                         :type "path"
                         :path (ngon pos size 4)}]))
             :drag (fn [{:id id :pos p :params params}]
                     (case id
                       :pos (replace-nth params 1 p)
                       :size (let [dir (vec2/- (nth params 1) p)
                                   size (+ (abs (.x dir)) (abs (.y dir)))
                                   args (->> (drop 2 params)
                                             (apply hash-map)
                                             (#(assoc % :size size))
                                             (entries)
                                             (apply concat))]
                               `[~@(take 2 params) ~@args])))}}
  [text pos & xs]
  [:text text pos (apply hash-map xs)])

(defalias text graphics/text)

(defn graphics/point-cloud
  {:doc "Creates vector of points"
   :params [&
            {:label "Point" :type "vec2"}]
   :handles {:draw (fn [{:params pts}]
                     (concat [{:id "new" :type "bg"}]
                             (map-indexed (fn [i p] {:id i :type "point" :pos p}) pts)))
             :drag (fn [{:id id :pos p
                         :unevaluated-params $pts}]
                     (if (number? id)
                       (replace-nth $pts id p)
                       (concat $pts [p])))}}
  [& pts]
  (vec pts))
(defalias point-cloud graphics/point-cloud)

(defn pc/scatter
  {:doc "Scatters points"
   :params [{:type "vec2"}
            {:type "number"}
            {:type "number"}]}
  [center radius n seed]
  (let [seed-offset (rnd seed)]
    (map (fn [i]
           (vec2/+
            center
            (vec2/dir (* (rnd (+ i seed-offset)) TWO_PI)
                      (* (rnd (+ i 0.5 seed-offset)) radius))))
         (range n))))
