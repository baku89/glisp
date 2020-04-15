;; Pens and Hands
(defmacro begin-draw (state)
  `(def ~state nil))

(defmacro draw (f state input)
  `(do
     (def __ret__ (~f ~state ~input))
     (def ~state (if (first __ret__) __ret__ (concat (list (first ~state)) (rest __ret__))))
     (first __ret__)))

(def $pens ())
(def $hands ())

(defmacro defpen (name params body)
  `(do
     (def ~name (fn ~params ~body))
     (def $pens (push $pens '~name))))

(defmacro defhand (name params body)
  `(do
     (def ~name (fn ~params ~body))
     (def $hands (push $hands '~name))))
