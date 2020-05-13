;; Graphics and UI
(def $sketch "")
(def $width 1000)
(def $height 1000)
(def $size [$width $height])
(def $background nil)
(def $guide-color nil)
(def $line-width 1)

;; Sketch
;; (defn normalize-element
;;   {:private true}
;;   [el]
;;   (let [tag (first el) content (rest el)]
;;     (if (keyword? tag)
;;       (cond (= tag :g)
;;             (let [has-attrs (map? (first content))
;;                   attrs (if has-attrs (first content) {})
;;                   body (->> (if has-attrs (rest content) content)
;;                             (map #(if (list? %) % [%]))
;;                             (apply concat)
;;                             (map normalize-element)
;;                             (remove nil?))]
;;               (vec `(~tag ~attrs ~@body)))

;;             :else
;;             el))))

(defn sketch [& xs]
  (let [sketch-body (filter element? (slice xs (inc (last-index-of :start-sketch xs))))]
    (vec (concat :g sketch-body))))


;; Pens and Hands
;; (defmacro begin-draw
;;   {:private true}
;;   [state]
;;   `(def ~state nil))

;; (defmacro draw
;;   {:private true}
;;   [f state input]
;;   `(do
;;      (def __ret__ (~f ~state ~input))
;;      (def ~state (if (first __ret__) __ret__ (concat (list (first ~state)) (rest __ret__))))
;;      (first __ret__)))

;; (def $pens [])
;; (def $hands [])

;; (defmacro defpen
;;   {:private true}
;;   [name params body]
;;   `(do
;;      (def ~name (fn ~params ~body))
;;      (def $pens (conj $pens '~name))))

;; (defmacro defhand
;;   {:private true}
;;   [name params body]
;;   `(do
;;      (def ~name (fn ~params ~body))
;;      (def $hands (conj $hands '~name))))
