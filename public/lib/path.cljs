(import "math.cljs")

(defn path? [a] (and (sequential? a) (= :path (first a))))

;; Shape functions

(defn path/rect
  {:doc  "Generate a rect path"
   :params [{:label "Pos" :type "vec2" :desc "coordinate of top-left corner of the rectangle"}
            {:label "Size" :type "vec2" :desc "size of the rectangle"}]
   :return {:type "path"}
   :handles {:draw (fn [pos size]
                     [{:type "point" :id :top-left :pos pos}
                      {:type "point" :id :bottom-right :pos (vec2/+ pos size)}])
             :on-drag (fn [id p [pos size]]
                        (case id
                          :top-left [p (vec2/+ (vec2/- pos p) size)]
                          :bottom-right [pos (vec2/- p pos)]))}}
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
             {:label "Radius" :type  "number" :desc "radius o fthe circle"}]
    :handles {:draw (fn [center radius]
                      [{:type "point" :id :center :pos center}
                       {:type "biarrow" :id :radius :pos (vec2/+ center [radius 0])}])
              :on-drag (fn [id p [center radius]]
                         (case id
                           :center [p radius]
                           :radius [center (vec2/dist center p)]))}}
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
   :handles {:draw (fn [from to]
                     [{:type "point" :id :from :pos from}
                      {:type "point" :id :to :pos to}])
             :on-drag (fn [id p [from to]]
                        (case id
                          :from [p to]
                          :to [from p]))}}
  [from to]
  [:path :M from :L to])
(defalias line path/line)

(def arc (with-meta arc
           (assoc (meta arc)
                  :handles
                  {:draw (fn [center r start end]
                           [{:type "point" :id :center :pos center}
                            {:type "point" :id :start :pos (vec2/+ center (vec2/dir start r))}
                            {:type "point" :id :end :pos (vec2/+ center (vec2/dir end r))}])
                   :on-drag (fn [id p [center r start end]]
                              (case id
                                :center `(~p ~r ~start ~end)
                                :start (let [start (vec2/angle (vec2/- p center))]
                                         `(~center ~r ~start ~end))
                                :end (let [end (vec2/angle (vec2/- p center))]
                                       `(~center ~r ~start ~end))))})))

(defn path/polyline
  {:doc "Generates a polyline path"
   :params [& {:label "Vertex" :type "vec2"}]
   :handles {:draw (fn [& pts]
                     (concat
                      (map-indexed (fn [i p] {:type "point" :id [:edit i] :pos p}) pts)
                      (map (fn [i] {:type "point"
                                    :id [:add (inc i)]
                                    :pos (vec2/lerp (nth pts i)
                                                    (nth pts (inc i))
                                                    .5)})
                           (range (dec (count pts))))))
             :on-drag (fn [[mode i] p [& pts]]
                        (case mode
                          :edit (replace-nth pts i p)
                          :add [:change-id [:edit i]
                                (insert-nth pts i p)]))}}
  [& pts]
  (vec (concat :path
               :M [(first pts)]
               (apply concat (map #`(:L ~%) (rest pts))))))
(defalias polyline path/polyline)

(defn path/polygon [& pts]
  (conj (apply polyline pts) :Z))
(defalias polygon path/polygon)

(defn path/ellipse
  {:doc "Generate an ellipse path"
   :params [{:type "vec2"}
            {:type "vec2"}]}
  [center size]
  (->> (circle [0 0] 1)
       (path/scale size)
       (path/translate center)))
(defalias ellipse path/ellipse)

(defn path/point
  {:doc "Generate a point path"
   :params [{:label "Pos" :type "vec2"}]}
  [p]
  [:path :M p :L p])
(defalias point path/point)

;; Path modifiers

(defn path/map-points [f path]
  (vec
   (apply concat :path (map (fn [[cmd & points]] `(~cmd ~@(map f points)))
                            (path/split-segments path)))))

(defn path/translate
  {:doc "Returns a translated path"
   :params [{:label "Value" :type "vec2"} {:type "path"}]
   :return {:type "path"}}
  [t path]
  (path/map-points #(vec2/+ % t) path))

(defn path/translate-x [tx path]
  (path/map-points #(vec2/+ % [tx 0]) path))

(defn path/translate-x [ty path]
  (path/map-points #(vec2/+ % [0 ty]) path))

(defn path/scale [s path]
  (path/map-points #(vec2/* % s) path))

(defn path/scale-x
  {:doc "Returns a path scaled along x-axis"
   :params [{:label "Value" :type "vec2"} {:type "path"}]
   :return {:type "path"}}
  [sx path]
  (path/map-points #(vec2/* % [sx 1]) path))

(defn path/scale-y [sy path]
  (path/map-points #(vec2/* % [1 y]) path))

(defn path/rotate [origin angle path]
  (path/map-points #(vec2/rotate origin angle %) path))

(defn path/merge
  {:doc "Returns a merged path"
   :params [& {:type "path"}]
   :return {:type "path"}}
  [& paths]
  (vec (concat :path (apply concat (map rest paths)))))
