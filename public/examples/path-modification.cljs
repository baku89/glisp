(defn cloud
  {:handles
   {:draw (fn [{:params [x0 x1 y width]}]
            [{:type "path" :path (line [x0 y] [x1 y])
              :class "dashed"}
             {:id :start
              :type "point" :pos [x0 y]}
             {:id :end
              :type "point" :pos [x1 y]}
             {:id :width
              :type "arrow" :pos [x0 (+ y width)]
              :angle HALF_PI}])
    :drag (fn [{:id id :pos p :params [x0 x1 y width]}]
            (case id
              :start [(.x p) x1 (.y p) width]
              :end [x0 (.x p) (.y p) width]
              :width [x0 x1 y (abs (- (.y p) y))]))}}
  [x0 x1 y width]
  (path/offset-stroke width
                      (line [x0 y] [x1 y])))

:start-sketch

(g {:style (stroke "yellow" 4)
    :transform (translate [62 198])}

   (def p
     (path/unite
      (cloud 216 571 137 45)
      (cloud 66 425 74 41)
      (cloud 328 464 201 31)
      (cloud 361 707 245 21)))

   (for [off [20 40]]
     (path/offset off p)))
