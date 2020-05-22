(import "math.cljs")

(import-js-force "path.js")

(defn path? [a] (and (sequential? a) (= :path (first a))))

;; Shape functions

(defn path/rect
  {:doc  "Generates a rect path"
   :params [{:label "Pos" :type "vec2" :desc "coordinate of top-left corner of the rectangle"}
            {:label "Size" :type "vec2" :desc "size of the rectangle"}]
   :returns {:type "path"}
   :handles {:draw (fn [{:params [[x y] [w h]]}]
                     [; center
                      {:type "point" :id :center :class "translate" :pos (vec2/scale-add [x y] [w h] .5)}
                      ; edges
                      {:type "path" :id :left :path (line [x y] [x (+ y h)])}
                      {:type "path" :id :top :path (line [x y] [(+ x w) y])}
                      {:type "path" :id :right :path (line [(+ x w) y] (vec2/+ [x y] [w h]))}
                      {:type "path" :id :bottom :path (line [x (+ y h)] (vec2/+ [x y] [w h]))}
                      ; corners
                      {:type "point" :id :top-left :pos [x y]}
                      {:type "point" :id :top-right :pos [(+ x w) y]}
                      {:type "point" :id :bottom-left :pos [x (+ y h)]}
                      {:type "point" :id :bottom-right :pos (vec2/+ [x y] [w h])}])
             :drag (fn [{:id id :pos p :delta-pos [dx dy]
                         :params [[_x _y] [_w _h]]
                         :unevaluated-params [$pos $size]}]
                     (case id
                       :center [(vec2/+ [_x _y] [dx dy]) $size]
                       :left  [[(+ _x dx) _y] [(- _w dx) _h]]
                       :top   [[_x (+ _y dy)] [_w (- _h dy)]]
                       :right [$pos [(+ _w dx) _h]]
                       :bottom [$pos [_w (+ _h dy)]]
                       :top-left [p (vec2/- (vec2/+ [_x _y] [_w _h]) p)]
                       :top-right [[_x (.y p)] [(- (.x p) _x) (- (+ _y _h) (.y p))]]
                       :bottom-left [[(.x p) _y] [(- (+ _x _w) (.x p)) (- (.y p) _y)]]
                       :bottom-right [$pos (vec2/- p [_x _y])]))}}
  [[x y] [w h]]
  [:path
   :M [x y]
   :L [(+ x w) y]
   :L [(+ x w) (+ y h)]
   :L [x (+ y h)]
   :Z])
(defalias rect path/rect)


(def path/circle
  ^{:doc "Generate a circle path"
    :params [{:label "Center" :type "vec2"  :desc "the centre of the circle"}
             {:label "Radius" :type  "number" :desc "radius of the circle"}]
    :handles {:draw (fn [{:params [center radius]
                          :return path}]
                      [{:type "path" :id :radius :path path}
                       {:type "arrow" :id :radius
                        :pos (vec2/+ center [radius 0])}
                       {:type "point"
                        :id :center
                        :class "translate"
                        :pos center}])
              :drag (fn [{:id id :pos p
                          :params [center radius]
                          :unevaluated-params [$center $radius]}]
                      (case id
                        :center [p $radius]
                        :radius [$center (vec2/dist center p)]))}}
  (let [K (/ (* 4 (- (sqrt 2) 1)) 3)]
    (fn [[x y] r]
      (let [k (* r K)]
        [:path
         :M [(+ x r) y]			 ; right
         :C [(+ x r) (+ y k)] [(+ x k) (+ y r)] [x (+ y r)] ; bottom
         :C [(- x k) (+ y r)] [(- x r) (+ y k)] [(- x r) y] ; left
         :C [(- x r) (- y k)] [(- x k) (- y r)] [x (- y r)] ; top
         :C [(+ x k) (- y r)] [(+ x r) (- y k)] [(+ x r) y] ; right
         :Z]))))
(defalias circle path/circle)

(defn path/line
  {:doc "Generates a line segment path"
   :params [{:type "vec2"}
            {:type "vec2"}]
   :handles {:draw (fn [{:params [from to]
                         :return path}]
                     [{:type "path" :id :path :path path}
                      {:type "point" :id :from :pos from}
                      {:type "point" :id :to :pos to}])
             :drag (fn [{:id id :pos p :delta-pos dp
                         :params [from to]
                         :unevaluated-params [$from $to]}]
                     (case id
                       :path [(vec2/+ from dp) (vec2/+ to dp)]
                       :from [p $to]
                       :to [$from p]))}}
  [from to]
  [:path :M from :L to])

(defalias line path/line)

(def path/arc
  ^{:doc "Generate an arc path"
    :params [{:label "Center"
              :type "vec2"
              :desc "Coordinate of the arc's center"}
             {:label "Radius"
              :type "number"
              :desc "The arc's radius"}
             {:label "Start"
              :type "number"
              :desc "Angle to start the arc"}
             {:label "End"
              :type "number"
              :desc "Angle to stop the arc"}]
    :handles
    {:draw (fn [{:params [center r start end]
                 :return path}]
             [{:id :radius :type "path"
               :path path}
              {:id :center :type "point" :class "translate"
               :pos center}
              {:id :start :type "point"
               :pos (vec2/+ center (vec2/dir start r))}
              {:id :end :type "point"
               :pos (vec2/+ center (vec2/dir end r))}])
     :drag (fn [{:id id
                 :pos p
                 :prev-pos pp
                 :params [center r start end]
                 :unevaluated-params [$center $r $start $end]}]
             (case id
               :radius [$center (vec2/dist center p) $start $end]
               :center [p $r $start $end]
               :start (let [start (calc-dragged-rotation
                                   :center center
                                   :pos p
                                   :prev-pos pp
                                   :angle start)]
                        [$center $r start $end])
               :end (let [end (calc-dragged-rotation
                               :center center
                               :pos p
                               :prev-pos pp
                               :angle end)]
                      [$center $r $start end])))}}
  path/arc)
(defalias arc path/arc)

(defn path/polyline
  {:doc "Generates a polyline path"
   :params [& {:label "Vertex" :type "vec2"}]
   :handles {:draw (fn [{:params [& pts]}]
                     (concat
                      (map-indexed
                       (fn [i p] {:type "point"
                                  :id [:edit i]
                                  :pos p})
                       pts)
                      (map (fn [i] {:type "point"
                                    :id [:add (inc i)]
                                    :class "dashed"
                                    :pos (vec2/lerp (nth pts i)
                                                    (nth pts (inc i))
                                                    .5)})
                           (range (dec (count pts))))))
             :drag (fn [{:id id :pos p
                         :params [& pts]}]
                     (let [[mode i] id]
                       (case mode
                         :edit (replace-nth pts i p)
                         :add [:change-id [:edit i]
                               (insert-nth pts i p)])))}}
  [& pts]
  (if (zero? (count pts))
    [:path]
    `[:path
      :M ~(first pts)
      ~@(apply concat (map #(list :L %) (rest pts)))]))
(defalias polyline path/polyline)

(defn path/polygon [& pts]
  (conj (apply polyline pts) :Z))
(defalias polygon path/polygon)

(defn path/ellipse
  {:doc "Generates an ellipse path"
   :params [{:type "vec2"}
            {:type "vec2"}]
   :handles {:draw (fn [{:params [center [rx ry]]
                         :return path}]
                     [{:type "path" :guide true :path path}
                      {:type "arrow" :id :radius-x
                       :pos (vec2/+ center [rx 0])}
                      {:type "arrow" :id :radius-y
                       :pos (vec2/+ center [0 ry])
                       :angle HALF_PI}
                      {:type "point"
                       :id :center
                       :class "translate"
                       :pos center}])
             :drag (fn [{:id id :pos p
                         :params [center [rx ry]]}]
                     (case id
                       :center [p [rx ry]]
                       :radius-x [center [(abs (- (.x p) (.x center))) ry]]
                       :radius-y [center [rx (abs (- (.y p) (.y center)))]]))}}
  [center radius]
  (path/transform (mat2d/* (translate center)
                           (scale radius))
                  (circle [0 0] 1)))
(defalias ellipse path/ellipse)

(defn path/ngon
  {:doc "Generates a regular polygon"
   :params [{:type "vec2"}
            {:type "number" :constraints {:min 0}}
            {:label "# of Vertices" :type "number" :constraints {:min 3 :step 1}}]}
  [center radius n]
  (let [angles (column 0 n (/ TWO_PI n))
        vertices (map #(vec2/+ center (vec2/dir % radius)) angles)]
    (apply polygon vertices)))
(defalias ngon path/ngon)

(defn path/point
  {:doc "Generates a point path"
   :params [{:label "Pos" :type "vec2"}]}
  [p]
  [:path :M p :L p])
(defalias point path/point)

;; Path modifiers

(def path/transform
  ^{:doc "Applies transform matrix for the vertex of input path"
    :params [{:label "Matrix" :type "mat2d"}
             {:label "Path" :type "path"}]
    :returns {:type "path"}}
  path/transform)

(defn path/merge
  {:doc "Returns a merged path"
   :params [& {:type "path"}]
   :returns {:type "path"}}
  [& paths]
  `[:path ~@(apply concat (map rest paths))])

;; Annotations for JS functions

(def path/trim
  ^{:doc "Trims a path by normalized range"
    :params [{:label "Start" :type "number" :constraints {:min 0 :max 1}}
             {:label "End" :type "number" :constraints {:min 0 :max 1}}
             {:label "Path" :type "path"}]
    :returns {:type "path"}
    :handles {:draw (fn [{:params [start end path]
                          :return trimmed-path}]
                      [{:type "path" :id :path-original :class "dashed" :guide true
                        :path path}
                       {:type "path" :id :path-trimmed :guide true
                        :path trimmed-path}
                       {:type "point" :id :start :pos (path/position-at start path)}
                       {:type "point" :id :end :pos (path/position-at end path)}])
              :drag (fn [{:id id :pos p
                          :params [start end path]
                          :unevaluated-params [$start $end $path]}]
                      (case id
                        :start [(path/nearest-offset p path) $end $path]
                        :end [$start (path/nearest-offset p path) $path]))}}
  path/trim)

(def path-boolean-meta
  {:params [& {:label "Path" :type "path"}]
   :handles {:draw (fn [[& paths]]
                     (map #(hash-map
                            :type "path"
                            :guide true
                            :class "dashed"
                            :path %)
                          paths))}})


(def path/unite
  ^(assoc path-boolean-meta :doc "Unites the paths") path/unite)
(def path/intersect
  ^(assoc path-boolean-meta :doc "Intersects the paths") path/intersect)
(def path/subtract
  ^(assoc path-boolean-meta :doc "Subtracts the paths") path/subtract)
(def path/exclude
  ^(assoc path-boolean-meta :doc "Excludes the paths") path/exclude)
(def path/divide
  ^(assoc path-boolean-meta :doc "Divides the paths") path/divide)

(def path-offset-meta
  {:params [{:label "Offset" :type "number"}
            {:label "Path" :type "path"}
            &
            {:keys [{:key :join :type "string" :default "round"
                     :enum ["miter" "bevel" "round"]}
                    {:key :cap :type "string" :default "round"
                     :enum ["butt" "round"]}]}]
   :returns {:type "path"}
   :handles {:draw (fn [{:params [d orig-path]
                         :return offset-path}]
                     [{:type "path" :guide true
                       :class "dashed" :path orig-path}
                      {:type "path" :path offset-path}
                      {:type "arrow"
                       :pos (path/position-at 0 offset-path)
                       :angle (+ HALF_PI (path/angle-at 0 offset-path))}])
             :drag (fn [{:pos p
                         :params [_ orig-path]
                         :unevaluated-params [_ & $xs]}]
                     (let [near-t (path/nearest-offset p orig-path)
                           near-pt (path/position-at near-t orig-path)
                           near-n (path/normal-at near-t orig-path)
                           near-dir (vec2/- p near-pt)
                           d-sign (sign (vec2/dot near-n near-dir))
                           d (* (vec2/len near-dir) d-sign)]
                       `(~d ~@$xs)))}})

(def path/offset
  ^(assoc path-offset-meta :doc "Offsets a path") path/offset)
(def path/offset-stroke
  ^(assoc path-offset-meta :doc "Generates outline stroke from a path") path/offset-stroke)