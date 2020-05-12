;; Example: Replicator

(defn path/replicator
  [xform n path]
  (->> (reduce #(conj % (mat2d/mul (last %) xform))
               [mat2d/ident]
               (range (dec n)))
       (map #(path/transform % path))))

:start-sketch

(background "#08101D")

[:g {:style (stroke "#CECCFF")
     :transform (translate [250 250])}

 (path/replicator
  (transform (translate [30 -24])
             (rotate 0.12176655678815762)
             (scale [0.95 0.95]))
  60
  (circle [0 0] 150))]